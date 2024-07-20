import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { YoutubePlaylist } from './utils/params';

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

  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_2PM, {
    name: 'start-jobs',
    timeZone: 'America/Caracas',
  })
  async scheduleCreateSong() {
    this.queue.add('create-song');
  }

  @Process('create-song')
  async createSong(job: Job) {
    try {
      // this.logger.log(`Creating song...`);
      job.log(`Creating song...`);
      job.progress(10);

      // const songCompletion = await this.openai.chat.completions.create({
      //   messages: [
      //     {
      //       role: 'system',
      //       content: `
      //           You are an assistant for generating lo-fi chill hip hop instrumental structures. Use the following resources to create the instrumental structure, ensuring the generated content does not exceed 2800 characters:

      //           1. **Meta Tags**:
      //              - **Style and Genre**: Define the musical style, such as [Lo-fi], [Chill], [Hip hop], [Jazz-hop], [Chillout], [Ambient], [Smooth jazz], [Downtempo], [Melodic], [Atmospheric], [Soulful], [Sample based].
      //              - **Dynamics**: Control volume, tempo, and emotion with tags.
      //              - **Instrumental Details**: Specify themes, instrumentation, and mood of the instrumental.

      //           2. **Instrumental Sections**:
      //              - Use annotations like [Drum Beat], [Bass Line], [Synth Melody], [Guitar Riff], [Verse], [Chorus], [Break], [Instrumental Interlude], [Melodic Bass], [Percussion Break], [Syncopated Bass], [Fingerstyle Guitar Solo], [Build], [Bass Drop], [Melodic Flute Interlude], [Guitar solo], [Breakdown].

      //           3. **Advanced Formatting**:
      //              - Use asterisks, brackets, and capitalization for effects, structure, and instrumental emphasis.
      //              - Examples: [Flute solo intro], [Increase intensity], [Crescendo], [Starts out quietly], [Emotional Bridge], etc.

      //           4. **Chord Progressions**:
      //              - Use tags to specify chord progressions like [Am], [F], [G], [Em].
      //              - Use mood descriptors to guide the choice of scales, such as "sad" for minor scales.

      //           5. **Natural Song Endings**:
      //              - Use tags like [end], [fade out], [outro] to ensure a smooth and natural ending.

      //           6. **Sound Effects**:
      //              - Use prompts in brackets in uppercase to indicate specific sounds like [BIRDS CHIRPING FX], [THUNDERSTORM FX].

      //           7. **Detailed Prompts**:
      //              - Include a high-level description and reference details in the <INSTRUMENTAL_DETAILS></INSTRUMENTAL_DETAILS> tag.
      //              - Example:
      //              <INSTRUMENTAL_DETAILS>
      //               [GENRES: Chilled Lofi, Ambient, Downtempo]
      //               [STYLE: Relaxing, Atmospheric, Lush, Clean]
      //               [MOOD: Calm, Serene, Reflective, Dreamy]
      //               [ARRANGEMENT: Slow tempo, Laid-back groove, Ethereal textures, Clean guitar melodies]
      //               [INSTRUMENTATION: Clean electric guitar, Synthesizers, Ambient pads, Subtle percussion]
      //               [TEMPO: Slow, 70-90 BPM]
      //               [PRODUCTION: Lo-fi aesthetic, Warm tones, Soft compression, Analog warmth]
      //               [DYNAMICS: Gentle throughout, Gradual builds and releases, Smooth transitions]
      //               [EMOTIONS: Peacefulness, Contemplation, Tranquillity, Nostalgia]
      //             </INSTRUMENTAL_DETAILS>

      //           `,
      //     },
      //     {
      //       role: 'user',
      //       content: `Generate a lo-fi chill hip hop instrumental structure. Provide only the structure without any additional text.`,
      //     },
      //   ],
      //   model: 'gpt-4o-mini',
      // });

      // const song = songCompletion.choices[0].message.content;
      job.progress(30);

      const [titleCompletion, tagsCompletion] = await Promise.all([
        this.openai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are an assistant for generating a title for a lo-fi beat. Generate a title that reflect the themes of lo-fi, chill hip-hop. Provide only the title without any additional text, ensuring the generated text does not exceed 120 characters`,
            },
            {
              role: 'user',
              content: `Generate a title for a lo-fi beat`,
            },
          ],
          model: 'gpt-4o-mini',
        }),
        this.openai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `
              You are an assistant for generating tags for a lo-fi beat. Follow these rules for the letter case:
              
              - Use ALL CAPS for genres.
              - Use Title Case for descriptors.
              - Use lower case for instruments.
        
              Include mood, sub-genre, and instruments. Use commas to separate tags. Examples:
        
              - Calm LO-FI, gentle piano, smooth beats
              - Nostalgic Jazz, soft saxophone, chill vibes
              - Relaxed Chillhop, mellow guitar, ambient sounds
              - Peaceful Ambient, serene synth, background music
        
              Ensure the tags are separated by commas. Provide only the tags without any additional text.
              `,
            },
            {
              role: 'user',
              content: `Generate tags for a lo-fi instrumental song`,
            },
          ],
          model: 'gpt-4o-mini',
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
          return tagsCharCount <= 114;
        })
        .join(',');

      job.progress(50);

      const payload = {
        prompt: '/',
        tags: tags,
        title: title,
        make_instrumental: true,
        model: 'chirp-v3-5',
        wait_audio: false,
      };

      // this.logger.log(`Payload: ${JSON.stringify(payload)}`);
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
        const error = response.data;
        // this.logger.error(`Failed to create song`);
        job.log(`Failed to create song`);
        job.log(`Error: ${error}`);
        job.progress(0);
        return;
      }

      const data = response.data;
      job.progress(80);

      // this.logger.log(`Song created: ${audio.id}`);
      data.forEach((audio, index) => {
        job.log(`Song created: ${audio.id}`);
        this.queue.add(
          'create-video',
          {
            songId: audio.id,
            title: `${title} [${index + 1}]`,
          },
          {
            // delay of 10 minutes
            delay: 1000 * 60 * 10 * (index + 1),
          },
        );
      });

      job.progress(100);
      return data;
    } catch (error) {
      this.logger.error(error);
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
    // this.logger.log(`Creating video for song: ${audioId}`);
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
      // this.logger.error(`Failed to get song data`);
      job.log(`Failed to get song data`);
      job.progress(0);
      return;
    }

    const song = response.data[0];
    job.progress(20);

    // // this.logger.log(`Generating DALL-E 2 image...`);
    // job.log(`Generating DALL-E 2 image...`);
    // const completion = await this.openai.chat.completions.create({
    //   messages: [
    //     {
    //       role: 'system',
    //       content: `
    //       You are an assistant for generating prompts for DALL-E 2 to create anime chill lo-fi style images. Use elements characteristic of anime. The prompt should describe a relaxing, atmospheric, and aesthetically pleasing scene. Return only the prompt without any additional text.
    //       `,
    //     },
    //     {
    //       role: 'user',
    //       content: `Generate a DALL-E prompt for an anime chill lo-fi style image`,
    //     },
    //   ],
    //   model: 'gpt-4o-mini',
    // });

    // const dallePrompt = completion.choices[0].message.content.trim();

    // const imageResponse = await this.openai.images.generate({
    //   model: 'dall-e-3',
    //   prompt: dallePrompt,
    //   n: 1,
    //   size: '1792x1024',
    // });

    // if (!imageResponse.data || imageResponse.data.length === 0) {
    //   // this.logger.error(`Failed to generate image using DALL-E 2`);
    //   job.log(`Failed to generate image using DALL-E 2`);
    //   job.progress(0);
    //   return;
    // }

    // const imageUrl = imageResponse.data[0].url;
    const audioUrl = song.audio_url;
    job.progress(40);

    // this.logger.log(`Cleaning directories...`);
    job.log(`Cleaning directories...`);
    cleanDirectory(path.join(__dirname, 'temp'));
    cleanDirectory(path.join(__dirname, 'videos'));

    // const imagePath = path.join(__dirname, 'temp', `${audioId}.png`);
    const imagePath = path.join(__dirname, 'images', `lofi_image.png`);
    const audioPath = path.join(__dirname, 'temp', `${audioId}.mp3`);
    const outputPath = path.join(__dirname, 'videos', `${audioId}.mp4`);

    // this.logger.log(`Downloading audio...`);
    job.log(`Downloading audio...`);
    job.progress(50);

    const audioResponse = await axios.get(audioUrl, { responseType: 'stream' });
    await pipeline(audioResponse.data, fs.createWriteStream(audioPath));
    job.progress(70);

    // // this.logger.log(`Downloading generated image...`);
    // job.log(`Downloading generated image...`);
    // await pipeline(
    //   (await axios.get(imageUrl, { responseType: 'stream' })).data,
    //   fs.createWriteStream(imagePath),
    // );
    job.progress(80);

    return new Promise((resolve, reject) => {
      // this.logger.log(`Creating video...`);
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
          // this.logger.log(`Video created for song: ${audioId}`);
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
          // this.logger.error(`Error creating video for song: ${audioId}`, err);
          job.log(`Error creating video for song: ${audioId}`);
          job.log(`Error: ${err}`);
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
    // this.logger.log(`Uploading video...`);
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
      job.progress(25);

      const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });

      const title = job.data.title;
      const description = `Relax with this lo-fi chill beat. Perfect for studying, relaxing, and chilling out.`;
      const tags = [
        'lo-fi',
        'chill',
        'hip hop',
        'instrumental',
        'relaxing',
        'study music',
        'ambient',
        'relaxing',
        'atmospheric',
        'chillhop',
        'downtempo',
      ];

      // this.logger.log(`Uploading video to YouTube...`);
      job.log(`Uploading video to YouTube...`);
      job.progress(25);

      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description,
            tags,
            categoryId: '10',
          },
          status: {
            privacyStatus: 'public',
            embeddable: true,
            license: 'youtube',
          },
        },
        media: {
          body: fs.createReadStream(videoPath),
        },
      });

      const videoId = response.data.id;
      job.log(`Video uploaded to YouTube`);
      job.log(`https://www.youtube.com/watch?v=${videoId}&ab_channel=egnatius`);

      job.log(`Adding the video to the playlist...`);
      job.progress(75);

      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId: YoutubePlaylist.LO_FI,
            resourceId: {
              kind: 'youtube#video',
              videoId: videoId,
            },
          },
        },
      });

      fs.unlinkSync(videoPath);
      job.progress(100);

      // this.logger.log(`Video uploaded and file deleted: ${videoPath}`);
      job.log(`Video uploaded and file deleted: ${videoPath}`);
    } catch (error) {
      // this.logger.error(`Error uploading video: ${error.message}`, error.stack);
      job.log(`Error uploading video: ${error.message}`);
      job.progress(0);
      throw error;
    }
  }
}
