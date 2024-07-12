import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Job, Queue } from 'bull';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import * as stream from 'stream';
import { cleanDirectory } from './utils/functions';

const pipeline = promisify(stream.pipeline);

const baseUrl = 'http://localhost:3000';

@Processor('publisher')
@Injectable()
export class AppJobs {
  constructor(@InjectQueue('publisher') private readonly queue: Queue) {}
  private readonly logger = new Logger(AppJobs.name);

  @Cron(CronExpression.EVERY_DAY_AT_2PM, {
    name: 'start-jobs',
  })
  async scheduleCreateSong() {
    this.queue.add('create-song');
  }

  @Process('create-song')
  async createSong() {
    this.logger.log(`Creating song...`);

    const payload = {
      prompt:
        "[Verse 1]\nCruel flames of war engulf this land\nBattlefields filled with death and dread\nInnocent souls in darkness, they rest\nMy heart trembles in this silent test\n\n[Verse 2]\nPeople weep for loved ones lost\nBattered bodies bear the cost\nSeeking peace and hope once known\nOur grief transforms to hearts of stone\n\n[Chorus]\nSilent battlegrounds, no birds' song\nShadows of war, where we don't belong\nMay flowers of peace bloom in this place\nLet's guard this precious dream with grace\n\n[Bridge]\nThrough the ashes, we will rise\nHand in hand, towards peaceful skies\nNo more sorrow, no more pain\nTogether, we'll break these chains\n\n[Chorus]\nSilent battlegrounds, no birds' song\nShadows of war, where we don't belong\nMay flowers of peace bloom in this place\nLet's guard this precious dream with grace\n\n[Outro]\nIn unity, our strength will grow\nA brighter future, we'll soon know\nFrom the ruins, hope will spring\nA new dawn, we'll together bring",
      tags: 'lo-fi, chill, hip-hop',
      title: 'Silent Battlefield',
      make_instrumental: false,
      model: 'chirp-v3-5',
      wait_audio: false,
    };

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
      return;
    }

    const data = response.data;

    data.forEach((song, i) => {
      this.logger.log(`Song created: ${song.id}`);
      this.queue.add(
        'create-video',
        {
          songId: song.id,
        },
        {
          // delay of 10 minutes
          delay: 1000 * 60 * 10 * (i + 1),
        },
      );
    });

    return data;
  }

  @Process('create-video')
  async createVideo(
    job: Job<{
      songId: string;
    }>,
  ) {
    const audioId = job.data.songId;
    this.logger.log(`Creating video for song: ${audioId}`);

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
      return;
    }

    const song = response.data[0];

    const imageUrl = song.image_url;
    const audioUrl = song.audio_url;
    // const imageUrl =
    //   'https://cdn1.suno.ai/image_8bbdda8e-3fe5-4991-b1df-f74ee843afc4.png';
    // const audioUrl =
    //   'https://cdn1.suno.ai/8bbdda8e-3fe5-4991-b1df-f74ee843afc4.mp3';

    cleanDirectory(path.join(__dirname, 'temp'));
    cleanDirectory(path.join(__dirname, 'videos'));

    const imagePath = path.join(__dirname, 'temp', `${audioId}.png`);
    const audioPath = path.join(__dirname, 'temp', `${audioId}.mp3`);
    const outputPath = path.join(__dirname, 'videos', `${audioId}.mp4`);

    await pipeline(
      (await axios.get(imageUrl, { responseType: 'stream' })).data,
      fs.createWriteStream(imagePath),
    );

    const audioResponse = await axios.get(audioUrl, { responseType: 'stream' });
    await pipeline(audioResponse.data, fs.createWriteStream(audioPath));

    return new Promise((resolve, reject) => {
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
          fs.unlinkSync(imagePath);
          fs.unlinkSync(audioPath);
          this.queue.add('upload-video', {
            videoPath: outputPath,
          });
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`Error creating video for song: ${audioId}`, err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  @Process('upload-video')
  async uploadVideo(
    job: Job<{
      videoPath: string;
    }>,
  ) {
    const videoPath = job.data.videoPath;

    fs.unlinkSync(videoPath);
  }
}
