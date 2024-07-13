FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

COPY credentials.json token.json ./

RUN npm run build

CMD [ "npm", "run", "start:prod" ]