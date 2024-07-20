# TypeScript Monorepo for Automatic Suno Music and Video Generation and Upload

This project is a TypeScript monorepo containing two applications:

1. **Unofficial Suno API**: An AI for generating music. This is a submodule of a fork of the unofficial Suno API repository.
2. **NestJS Application**: Consumes the Suno API to generate songs and videos with the help of the OpenAI API and automatically uploads these videos to a YouTube channel and playlist periodically using cron and Bull.

## Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Docker](#docker)
- [Google Cloud Credentials](#google-cloud-credentials)
- [Scripts](#scripts)
- [Additional Notes](#additional-notes)

## Installation

1. Clone the repository:

   ```bash
   git clone <REPOSITORY_URL>
   cd <REPOSITORY_NAME>
   ```

2. Install dependencies using `pnpm`:

   ```bash
   pnpm install
   ```

## Configuration

1. **YouTube API**:

   - Configure credentials for the YouTube API in Google Cloud.
   - Download the `credentials.json` file and copy it to `/apps/orchestrator`.

2. **Token Generation**:

   - Run the following script to generate the `token.json` file:

     ```bash
     node apps/orchestrator/index.js
     ```

   - Remember that the `redirect_uri` you need to set in the `credentials.json` file is `urn:ietf:wg:oauth:2.0:oob` to generate the token, which the `index.js` script will then request.

## Usage

1. Start the application using Docker Compose:

   ```bash
   docker-compose up
   ```

2. Periodically update the Suno cookie, as it expires every 7 days.

## Project Structure

- `/apps`
  - `/api-suno`: Unofficial Suno API (submodule).
  - `/orchestrator`: NestJS application that consumes the Suno API, generates content, and uploads it to YouTube.

## Docker

This project uses `docker-compose` to start the applications. Make sure you have Docker and Docker Compose installed on your system.

## Google Cloud Credentials

To configure Google Cloud credentials:

1. Create a project in Google Cloud and enable the YouTube API.
2. Configure the OAuth consent screen.
3. Create OAuth 2.0 credentials and download the `credentials.json` file.
4. Copy `credentials.json` to `/apps/orchestrator`.
5. Run the script `node apps/orchestrator/index.js` to generate the `token.json` file.

## Scripts

- **Generate Token**:

  ```bash
  node apps/orchestrator/index.js
  ```

## Additional Notes

- Ensure you update the Suno cookie periodically, as it expires every 7 days.
- The project uses `cron` and `Bull` for periodic task execution.
