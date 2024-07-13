import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Job, Queue } from 'bull';
import axios from 'axios';
import * as fs from 'fs';
import { google } from 'googleapis';
import OpenAI from 'openai';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import * as stream from 'stream';
import { cleanDirectory } from './utils/functions';

const pipeline = promisify(stream.pipeline);

const baseUrl = 'http://suno-api:3000';

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

@Processor('publisher')
@Injectable()
export class AppJobs {
  constructor(@InjectQueue('publisher') private readonly queue: Queue) {}
  private readonly logger = new Logger(AppJobs.name);
  private readonly openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  @Cron('0 0 * * 1,4,6', {
    name: 'start-jobs',
  })
  async scheduleCreateSong() {
    this.queue.add('create-song');
  }

  @Process('create-song')
  async createSong(job: Job) {
    try {
      this.logger.log(`Creating song...`);
      job.log(`Creating song...`);
      job.progress(10);

      const songCompletion = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `
            You are an assistant for generating hip hop instrumental structures. Use the following resources to create the instrumental structure, and ensure that the generated content does not exceed 2800 characters:
      
            1. **Meta Tags**:
               - **Style and Genre**: Define the musical style, such as [Lo-fi], [Chill], [Hip hop], [Jazz-hop], [Chillout], [Ambient], [Smooth jazz], [Downtempo], [Melodic], [Atmospheric], [Soulful], [Sample based].
               - **Dynamics**: Control volume, tempo, and emotion with tags.
               - **Instrumental Details**: Specify themes, instrumentation, and mood of the instrumental.
               
            2. **Instrumental Sections**:
               - Use annotations like [Drum Beat], [Bass Line], [Synth Melody], [Guitar Riff].
               
            3. **Advanced Formatting**:
               - Use asterisks, brackets, and capitalization for effects, structure, and instrumental emphasis.
               - Examples: *gunshots*, [Flute solo intro], [Increase intensity], [Crescendo], [Starts out quietly], [Whispering vocals], [Screaming vocals], [Emotional Bridge], etc.
               
            4. **Chord Progressions**:
               - Use tags to specify chord progressions like [Am], [F], [G], [Em].
               - Use mood descriptors to guide the choice of scales, such as "sad" for minor scales.
               
            5. **Natural Song Endings**:
               - Use tags like [end], [fade out], [outro] to ensure a smooth and natural ending.
               
            6. **Sound Effects**:
               - Use prompts in brackets in uppercase to indicate specific sounds like [BIRDS CHIRPING FX], [THUNDERSTORM FX].
               
            7. **Detailed Prompts**:
               - Include a high-level description and reference details in the <INSTRUMENTAL_DETAILS></INSTRUMENTAL_DETAILS> tag.
               - Example: 
               <INSTRUMENTAL_DETAILS>
                [GENRES: Chilled Lofi, Ambient, Downtempo]
                [STYLE: Relaxing, Atmospheric, Lush, Clean]
                [MOOD: Calm, Serene, Reflective, Dreamy]
                [ARRANGEMENT: Slow tempo, Laid-back groove, Ethereal textures, Clean guitar melodies]
                [INSTRUMENTATION: Clean electric guitar, Synthesizers, Ambient pads, Subtle percussion]
                [TEMPO: Slow, 70-90 BPM]
                [PRODUCTION: Lo-fi aesthetic, Warm tones, Soft compression, Analog warmth]
                [DYNAMICS: Gentle throughout, Gradual builds and releases, Smooth transitions]
                [EMOTIONS: Peacefulness, Contemplation, Tranquillity, Nostalgia]
              </INSTRUMENTAL_DETAILS>
              
            8. **Improve Performance in Hip Hop, Rap, and Trap**:
               - Experiment with different genres and combinations.
               - Use specific prompts for accents and regional styles.
               - Write in the desired accent using colloquial terms and regional slang.
              
            In each invocation, use a combination of these resources to generate a unique instrumental structure within the specified styles.
            `,
          },
          {
            role: 'user',
            content: `
            Generate a hip hop instrumental structure within the styles: lo-fi, chill, hip hop, jazz-hop, chillout, ambient, smooth jazz, downtempo, melodic, atmospheric, soulful, sample based, boom bap, funky, dj scratch. Provide only the structure without any additional text.
            `,
          },
        ],
        model: 'gpt-3.5-turbo',
      });

      const song = songCompletion.choices[0].message.content;
      job.progress(30);

      const [titleCompletion, tagsCompletion] = await Promise.all([
        this.openai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `
              You are an assistant for generating titles for hip hop instrumentals. Use the provided composition to come up with a fitting and catchy title for the instrumental. Ensure the title is concise, unique, and reflects the mood and style of the composition. Provide only the title without any additional text.
              `,
            },
            {
              role: 'user',
              content: `
              Generate a title for the following hip hop instrumental composition:
              
              ${song}
              `,
            },
          ],
          model: 'gpt-3.5-turbo',
        }),
        this.openai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `
              You are an assistant for generating tags for hip hop instrumentals. Use the provided composition to generate relevant tags. Follow these rules for the letter case:
              
              - Use ALL CAPS for genres.
              - Use Title Case for descriptors.
              - Use lower case for instruments.
              
              Ensure the tags are separated by commas. Provide only the tags without any additional text.
              `,
            },
            {
              role: 'user',
              content: `
              Generate tags for the following hip hop instrumental composition:
              
              ${song}
              `,
            },
          ],
          model: 'gpt-3.5-turbo',
        }),
      ]);

      const title = titleCompletion.choices[0].message.content
        .trim()
        .replace(/[^a-zA-Z0-9,-\s]/g, '');

      let tagsCharCount = 0;
      const tags = tagsCompletion.choices[0].message.content
        .trim()
        .replace(/[^a-zA-Z0-9,-\s]/g, '')
        .split(',')
        .filter((tag) => {
          tagsCharCount += tag.length;
          return tagsCharCount <= 100;
        })
        .join(',');

      job.progress(50);

      const payload = {
        prompt: song,
        tags: tags,
        title: title,
        make_instrumental: false,
        model: 'chirp-v3-5',
        wait_audio: false,
      };

      this.logger.log(`Payload: ${JSON.stringify(payload)}`);
      job.log(`Payload: ${JSON.stringify(payload)}`);

      const url = `${baseUrl}/api/custom_generate`;
      const response = await axios.post<
        {
          id: string;
          title: string;
          image_url: string;
          lyric: string;
          audio_url: string;
          video_url: string;
          created_at: string;
          model_name: string;
          status: string;
          gpt_description_prompt: string;
          prompt: string;
          type: string;
          tags: string;
        }[]
      >(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        this.logger.error(`Failed to create song`);
        job.log(`Failed to create song`);
        return;
      }

      const data = response.data;
      job.progress(80);

      const audio = data[Math.floor(Math.random() * data.length)];
      this.logger.log(`Song created: ${audio.id}`);
      job.log(`Song created: ${audio.id}`);
      this.queue.add(
        'create-video',
        {
          songId: audio.id,
          title: `${title}`,
        },
        {
          // delay of 10 minutes
          delay: 1000 * 60 * 10,
        },
      );

      job.progress(100);
      return data;
    } catch (error) {
      this.logger.error(
        `Error in createSong job: ${error.message}`,
        error.stack,
      );
      job.log(`Error in createSong job: ${error.message}:\n${error.stack}`);
      job.progress(0);
      throw error;
    }
  }

  @Process('create-video')
  async createVideo(
    job: Job<{
      songId: string;
      title: string;
    }>,
  ) {
    const audioId = job.data.songId;
    const title = job.data.title;
    this.logger.log(`Creating video for song: ${audioId}`);
    job.log(`Creating video for song: ${audioId}`);
    job.progress(10);

    const url = `${baseUrl}/api/get?ids=${audioId}`;

    const response = await axios.get<
      {
        id: string;
        title: string;
        image_url: string;
        lyric: string;
        audio_url: string;
        video_url: string;
        created_at: string;
        model_name: string;
        status: string;
        gpt_description_prompt: string;
        prompt: string;
        type: string;
        tags: string;
      }[]
    >(url);

    if (response.status !== 200) {
      this.logger.error(`Failed to get song data`);
      job.log(`Failed to get song data`);
      job.progress(0);
      return;
    }

    const song = response.data[0];
    job.progress(20);

    this.logger.log(`Generating DALL-E 2 image...`);
    job.log(`Generating DALL-E 2 image...`);
    const completion = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `
          You are an assistant for generating prompts for DALL-E 2 to create anime chill lo-fi style images. Use elements characteristic of anime, such as landscapes, samurais, cats, friends, etc. The prompt should describe a relaxing, atmospheric, and aesthetically pleasing scene. Return only the prompt without any additional text.
          `,
        },
        {
          role: 'user',
          content: `
          Generate a DALL-E prompt for an anime chill lo-fi style image with the following title:
          
          ${title}
          `,
        },
      ],
      model: 'gpt-3.5-turbo',
    });

    const dallePrompt = completion.choices[0].message.content.trim();

    const imageResponse = await this.openai.images.generate({
      model: 'dall-e-3',
      prompt: dallePrompt,
      n: 1,
      size: '1792x1024',
    });

    if (!imageResponse.data || imageResponse.data.length === 0) {
      this.logger.error(`Failed to generate image using DALL-E 2`);
      job.log(`Failed to generate image using DALL-E 2`);
      job.progress(0);
      return;
    }

    const imageUrl = imageResponse.data[0].url;
    const audioUrl = song.audio_url;
    job.progress(40);

    this.logger.log(`Cleaning directories...`);
    job.log(`Cleaning directories...`);
    cleanDirectory(path.join(__dirname, 'temp'));
    cleanDirectory(path.join(__dirname, 'videos'));

    const imagePath = path.join(__dirname, 'temp', `${audioId}.png`);
    const audioPath = path.join(__dirname, 'temp', `${audioId}.mp3`);
    const outputPath = path.join(__dirname, 'videos', `${audioId}.mp4`);

    this.logger.log(`Downloading audio...`);
    job.log(`Downloading audio...`);
    job.progress(50);

    const audioResponse = await axios.get(audioUrl, { responseType: 'stream' });
    await pipeline(audioResponse.data, fs.createWriteStream(audioPath));
    job.progress(70);

    this.logger.log(`Downloading generated image...`);
    job.log(`Downloading generated image...`);
    await pipeline(
      (await axios.get(imageUrl, { responseType: 'stream' })).data,
      fs.createWriteStream(imagePath),
    );
    job.progress(80);

    return new Promise((resolve, reject) => {
      this.logger.log(`Creating video...`);
      job.log(`Creating video...`);
      job.progress(90);

      ffmpeg()
        .input(imagePath)
        .loop()
        .input(audioPath)
        .audioCodec('aac')
        .videoCodec('libx264')
        .size('1920x1080')
        .autopad(true, 'black')
        .outputOptions(['-pix_fmt yuv420p', '-shortest'])
        .on('end', () => {
          this.logger.log(`Video created for song: ${audioId}`);
          job.log(`Video created for song: ${audioId}`);
          fs.unlinkSync(imagePath);
          fs.unlinkSync(audioPath);
          this.queue.add('upload-video', {
            videoPath: outputPath,
            title,
          });
          job.progress(100);
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`Error creating video for song: ${audioId}`, err);
          job.log(`Error creating video for song: ${audioId}`);
          job.progress(0);
          reject(err);
        })
        .save(outputPath);
    });
  }
  @Process('upload-video')
  async uploadVideo(
    job: Job<{
      videoPath: string;
      title: string;
    }>,
  ) {
    this.logger.log(`Uploading video...`);
    job.log(`Uploading video...`);
    job.progress(10);

    const videoPath = job.data.videoPath;

    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      job.progress(20);

      const credentials = JSON.parse(
        fs.readFileSync(CREDENTIALS_PATH, 'utf-8'),
      );
      const { client_secret, client_id, redirect_uris } = credentials.installed;

      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0],
      );
      oAuth2Client.setCredentials(token);
      job.progress(40);

      const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });

      const title = job.data.title;
      const description = '';
      const tags = [];

      this.logger.log(`Uploading video to YouTube...`);
      job.log(`Uploading video to YouTube...`);
      job.progress(60);

      await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description,
            tags,
            categoryId: '10',
          },
          status: {
            privacyStatus: 'private',
            embeddable: true,
            license: 'youtube',
          },
        },
        media: {
          body: fs.createReadStream(videoPath),
        },
      });

      job.progress(90);

      fs.unlinkSync(videoPath);
      job.progress(100);

      this.logger.log(`Video uploaded and file deleted: ${videoPath}`);
      job.log(`Video uploaded and file deleted: ${videoPath}`);
    } catch (error) {
      this.logger.error(`Error uploading video: ${error.message}`, error.stack);
      job.log(`Error uploading video: ${error.message}`);
      job.progress(0);
      throw error;
    }
  }
}
