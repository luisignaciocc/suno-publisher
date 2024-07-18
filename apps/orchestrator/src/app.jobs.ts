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
import {
  getProcessParams,
  getRandomTypeBeatStyles,
  ProcessType,
} from './utils/params';

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

  @Cron(CronExpression.EVERY_WEEKDAY, {
    name: 'start-jobs',
  })
  async scheduleCreateSong() {
    const randomProcessType =
      Object.values(ProcessType)[
        Math.floor(Math.random() * Object.values(ProcessType).length)
      ];
    const styles = getRandomTypeBeatStyles();
    this.queue.add('create-song', {
      processType: randomProcessType,
      styles,
    });
  }

  @Process('create-song')
  async createSong(
    job: Job<{
      processType: ProcessType;
      styles: [string, string];
    }>,
  ) {
    try {
      // this.logger.log(`Creating song...`);
      job.log(`Creating song...`);
      job.progress(10);

      const styles = job.data.styles;
      const processType = job.data.processType;
      const params = getProcessParams(processType, styles);

      const songCompletion = await this.openai.chat.completions.create({
        messages: params.songCompletionMessages,
        model: 'gpt-4o-mini',
        temperature: 1.5,
      });

      const song = songCompletion.choices[0].message.content;
      job.progress(30);

      const [titleCompletion, tagsCompletion] = await Promise.all([
        this.openai.chat.completions.create({
          messages: params.titleCompletionMessages,
          model: 'gpt-4o-mini',
        }),
        this.openai.chat.completions.create({
          messages: params.tagsCompletionMessages,
          model: 'gpt-4o-mini',
          temperature: 1.5,
        }),
      ]);

      const title = params.getTitle(
        titleCompletion.choices[0].message.content
          .trim()
          .replace(/[^a-zA-Z0-9,-\s]/g, ''),
      );

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
        tags: tags + ', sample-based',
        title: title,
        make_instrumental: false,
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
            processType: processType,
            styles,
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
      processType: ProcessType;
      styles: [string, string];
    }>,
  ) {
    const audioId = job.data.songId;
    const title = job.data.title;
    // this.logger.log(`Creating video for song: ${audioId}`);
    job.log(`Creating video for song: ${audioId}`);
    job.progress(10);

    const processType = job.data.processType;
    const styles = job.data.styles;
    const params = getProcessParams(processType, styles);
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

    // this.logger.log(`Generating DALL-E 2 image...`);
    job.log(`Generating DALL-E 2 image...`);
    const completion = await this.openai.chat.completions.create({
      messages: params.createDallePromptCompletionMessages,
      model: 'gpt-4o-mini',
    });

    const dallePrompt = completion.choices[0].message.content.trim();

    const imageResponse = await this.openai.images.generate({
      model: 'dall-e-3',
      prompt: dallePrompt,
      n: 1,
      size: '1792x1024',
    });

    if (!imageResponse.data || imageResponse.data.length === 0) {
      // this.logger.error(`Failed to generate image using DALL-E 2`);
      job.log(`Failed to generate image using DALL-E 2`);
      job.progress(0);
      return;
    }

    const imageUrl = imageResponse.data[0].url;
    const audioUrl = song.audio_url;
    job.progress(40);

    // this.logger.log(`Cleaning directories...`);
    job.log(`Cleaning directories...`);
    cleanDirectory(path.join(__dirname, 'temp'));
    cleanDirectory(path.join(__dirname, 'videos'));

    const imagePath = path.join(__dirname, 'temp', `${audioId}.png`);
    const audioPath = path.join(__dirname, 'temp', `${audioId}.mp3`);
    const outputPath = path.join(__dirname, 'videos', `${audioId}.mp4`);

    // this.logger.log(`Downloading audio...`);
    job.log(`Downloading audio...`);
    job.progress(50);

    const audioResponse = await axios.get(audioUrl, { responseType: 'stream' });
    await pipeline(audioResponse.data, fs.createWriteStream(audioPath));
    job.progress(70);

    // this.logger.log(`Downloading generated image...`);
    job.log(`Downloading generated image...`);
    await pipeline(
      (await axios.get(imageUrl, { responseType: 'stream' })).data,
      fs.createWriteStream(imagePath),
    );
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
            processType,
            styles,
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
      processType: ProcessType;
      styles: [string, string];
    }>,
  ) {
    // this.logger.log(`Uploading video...`);
    job.log(`Uploading video...`);
    job.progress(10);

    const styles = job.data.styles;
    const processType = job.data.processType;
    const params = getProcessParams(processType, styles);
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
      const description = params.videoDescription;
      const tags = params.videoTags;

      // this.logger.log(`Uploading video to YouTube...`);
      job.log(`Uploading video to YouTube...`);
      job.progress(60);

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

      job.progress(90);

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
