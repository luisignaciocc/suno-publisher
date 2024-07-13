/* eslint-disable @typescript-eslint/no-var-requires */
const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');

// Carga tus credenciales desde el archivo JSON descargado
const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = 'token.json';

// Función para obtener un token nuevo después de autenticación
async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const code = await new Promise((resolve) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      resolve(code);
    });
  });
  const token = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(token.tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token.tokens));
  console.log('Token stored to', TOKEN_PATH);
  return token.tokens;
}

// Autenticación
async function authenticate() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );

  // Verificar si ya tenemos token guardado
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } else {
    return await getAccessToken(oAuth2Client);
  }
}

// Llamar a la función de autenticación
authenticate()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .then((authClient) => {
    console.log('Successfully authenticated');
  })
  .catch(console.error);
