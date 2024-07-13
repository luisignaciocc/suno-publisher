FROM node:18

WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg

COPY package*.json ./

RUN npm install

COPY . .

COPY credentials.json token.json ./

RUN npm run build

CMD [ "npm", "run", "start:prod" ]