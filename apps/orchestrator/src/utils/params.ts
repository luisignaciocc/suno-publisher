import { youtube_v3 } from 'googleapis';
import OpenAI from 'openai';

export enum ProcessType {
  LO_FI = 'LO_FI',
  // BOOM_BAP,
  TYPE_BEAT = 'TYPE_BEAT',
}

type ProcessParams = {
  songCompletionMessages: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming['messages'];
  titleCompletionMessages: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming['messages'];
  tagsCompletionMessages: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming['messages'];
  createDallePromptCompletionMessages: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming['messages'];
  videoDescription: youtube_v3.Schema$VideoSnippet['description'];
  videoTags: youtube_v3.Schema$VideoSnippet['tags'];
  getTitle: (title: string) => string;
};

export const getProcessParams = (
  processType: ProcessType,
  styles: [string, string],
): ProcessParams => {
  switch (processType) {
    case ProcessType.LO_FI:
      return loFiParams;
    // case ProcessType.BOOM_BAP:
    //   return boomBapParams;
    case ProcessType.TYPE_BEAT:
      return getTypeBeatParams(styles[0], styles[1]);
    default:
      return loFiParams;
  }
};

const loFiParams: ProcessParams = {
  songCompletionMessages: [
    {
      role: 'system',
      content: `
          You are an assistant for generating lo-fi chill hip hop instrumental structures. Use the following resources to create the instrumental structure, ensuring the generated content does not exceed 2800 characters:
    
          1. **Meta Tags**:
             - **Style and Genre**: Define the musical style, such as [Lo-fi], [Chill], [Hip hop], [Jazz-hop], [Chillout], [Ambient], [Smooth jazz], [Downtempo], [Melodic], [Atmospheric], [Soulful], [Sample based].
             - **Dynamics**: Control volume, tempo, and emotion with tags.
             - **Instrumental Details**: Specify themes, instrumentation, and mood of the instrumental.
             
          2. **Instrumental Sections**:
             - Use annotations like [Drum Beat], [Bass Line], [Synth Melody], [Guitar Riff], [Verse], [Chorus], [Break], [Instrumental Interlude], [Melodic Bass], [Percussion Break], [Syncopated Bass], [Fingerstyle Guitar Solo], [Build], [Bass Drop], [Melodic Flute Interlude], [Guitar solo], [Breakdown].
    
          3. **Advanced Formatting**:
             - Use asterisks, brackets, and capitalization for effects, structure, and instrumental emphasis.
             - Examples: [Flute solo intro], [Increase intensity], [Crescendo], [Starts out quietly], [Emotional Bridge], etc.
             - Use text that can't be sung to force space between sections, such as unicode characters: 
               [Verse]
               ┳┻┳┻┳┻┳┻┳┻┳┻
               ┻┳┻┳┻┳┻┳┻┳┻┳
    
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
            
          8. **Instrumental Lyrics**:
             - Use punctuation or onomatopoeic words to suggest instrumental sounds.
             - Examples: [Percussion Break] . .! .. .! !! ... ! ! !, [sad trombone] waah-Waaah-WAAH, [chugging guitar] chuka-chuka-chuka-chuka.
          `,
    },
    {
      role: 'user',
      content: `Generate a lo-fi chill hip hop instrumental structure. Provide only the structure without any additional text.`,
    },
  ],
  titleCompletionMessages: [
    {
      role: 'system',
      content: `You are an assistant for generating a title for a lo-fi instrumental song. Generate a title that reflect the themes of lo-fi, chill, ambient and relax. Provide only the title without any additional text.`,
    },
    {
      role: 'user',
      content: `Generate a title for a lo-fi instrumental song`,
    },
  ],
  tagsCompletionMessages: [
    {
      role: 'system',
      content: `
      You are an assistant for generating tags for a lo-fi instrumental song. Follow these rules for the letter case:
      
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
  createDallePromptCompletionMessages: [
    {
      role: 'system',
      content: `
      You are an assistant for generating prompts for DALL-E 2 to create anime chill lo-fi style images. Use elements characteristic of anime. The prompt should describe a relaxing, atmospheric, and aesthetically pleasing scene. Return only the prompt without any additional text.
      `,
    },
    {
      role: 'user',
      content: `Generate a DALL-E prompt for an anime chill lo-fi style image`,
    },
  ],
  videoDescription: `Relax and unwind with this lo-fi chill hip hop instrumental. Perfect for studying, relaxing, and chilling out.`,
  videoTags: [
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
  ],
  getTitle: (title: string) => {
    return `lo-fi chill beat - ${title}`;
  },
};

const getTypeBeatParams: (style1: string, style2: string) => ProcessParams = (
  style1,
  style2,
) => ({
  songCompletionMessages: [
    {
      role: 'system',
      content: `
            You are an assistant for generating hip hop instrumental structures. Use the following resources to create the instrumental structure, ensuring the generated content does not exceed 2800 characters:

            1. **Meta Tags**:
                - **Style and Genre**: Define the musical style, such as [Boom Bap], [Trap], [Lo-fi Hip Hop], [Jazz-hop], [Sample based], [Soulful], [Funky], or names of specific producers or rappers like [J Dilla], [Dr. Dre], [MF DOOM].
                - **Dynamics**: Control volume, tempo, and emotion with tags.
                - **Instrumental Details**: Specify themes, instrumentation, and mood of the instrumental.

            2. **Instrumental Sections**:
                - Use annotations like [Drum Beat], [Bass Line], [Synth Melody], [Guitar Riff], [Verse], [Chorus], [Break], [Instrumental Interlude], [Melodic Bass], [Percussion Break], [Syncopated Bass], [Fingerstyle Guitar Solo], [Build], [Bass Drop], [Melodic Flute Interlude], [Guitar solo], [Breakdown].
                - Incorporate elements like [Sampled Vinyl Scratch], [Classic Drum Break], [Looped Bass Line].

            3. **Advanced Formatting**:
                - Use asterisks, brackets, and capitalization for effects, structure, and instrumental emphasis.
                - Examples: [Vinyl Scratch Intro], [Increase intensity], [Crescendo], [Starts out quietly], [Emotional Bridge], etc.
                - Use text that can't be sung to force space between sections, such as unicode characters: 
                    [Verse]
                    ┳┻┳┻┳┻┳┻┳┻┳┻
                    ┻┳┻┳┻┳┻┳┻┳┻┳

            4. **Chord Progressions**:
                - Use tags to specify chord progressions like [Am], [F], [G], [Em].
                - Use mood descriptors to guide the choice of scales, such as "funky" or "jazzy" for major and minor scales.

            5. **Natural Song Endings**:
                - Use tags like [end], [fade out], [outro] to ensure a smooth and natural ending.

            6. **Sound Effects**:
                - Use prompts in brackets in uppercase to indicate specific sounds like [VINYL SCRATCH FX], [CROWD NOISE FX].

            7. **Detailed Prompts**:
                - Include a high-level description and reference details in the <INSTRUMENTAL_DETAILS></INSTRUMENTAL_DETAILS> tag.
                - Example: 
                    <INSTRUMENTAL_DETAILS>
                        [GENRES: STYLE_1, STYLE_2]
                        [STYLE: Raw, Gritty, Authentic, Sample-based]
                        [MOOD: Energetic, Nostalgic, Bold]
                        [ARRANGEMENT: Medium tempo, Punchy beats, Sampled loops, Jazzy elements]
                        [INSTRUMENTATION: Drum machine, Vinyl scratches, Jazz samples, Funky bass lines]
                        [TEMPO: Medium, 85-95 BPM]
                        [PRODUCTION: Lo-fi aesthetic, Warm tones, Heavy drum kicks, Crisp snares]
                        [DYNAMICS: Steady throughout, Occasional breaks, Smooth transitions]
                        [EMOTIONS: Confidence, Street vibe, Grit]
                    </INSTRUMENTAL_DETAILS>

            8. **Instrumental Lyrics**:
                - Use punctuation or onomatopoeic words to suggest instrumental sounds.
                - Examples: [Percussion Break] boom-boom-BOOM, [Drum Beat] bap-bap-bap, [Vinyl Scratch] wicka-wicka.
        `,
    },
    {
      role: 'user',
      content: `Generate a hip hop instrumental structure inspired by two different styles: ${style1} and ${style2}. Provide only the structure without any additional text.`,
    },
  ],
  titleCompletionMessages: [
    {
      role: 'system',
      content: `
          You are an assistant for generating a title for a hip hop instrumental song. Generate a title that reflects the themes of the specified styles. Provide only the title without any additional text.
        `,
    },
    {
      role: 'user',
      content: `
          Generate a title for a hip hop instrumental song inspired by two different styles: ${style1} and ${style2}.
        `,
    },
  ],
  tagsCompletionMessages: [
    {
      role: 'system',
      content: `
        You are an assistant for generating tags for a hip hop instrumental song. Follow these rules for the letter case:
        
        - Use ALL CAPS for genres.
        - Use Title Case for descriptors.
        - Use lower case for instruments.

        Include mood, sub-genre, and instruments. Use commas to separate tags. Examples:

        - Energetic BOOM BAP, punchy drums, jazzy samples
        - Gritty OLD SCHOOL HIP HOP, vinyl scratches, street vibe
        - Bold 90s HIP HOP, funky bass line, raw beats
        - Nostalgic JAZZ-HOP, soulful piano, classic loops

        Ensure the tags are separated by commas. Provide only the tags without any additional text.
      `,
    },
    {
      role: 'user',
      content: `
        Generate tags for a hip hop instrumental song inspired by two different styles: ${style1} and ${style2}.
      `,
    },
  ],
  createDallePromptCompletionMessages: [
    {
      role: 'system',
      content: `
        You are an assistant for generating prompts for DALL-E 2 to create anime style images inspired by hip hop themes. Use elements characteristic of anime and the specified hip hop styles. The prompt should describe a gritty, street vibe, and nostalgic scene. Do not mention any producers explicitly. Return only the prompt without any additional text.
      `,
    },
    {
      role: 'user',
      content: `
        Generate a DALL-E prompt for an anime style image with a hip hop theme inspired by two different styles: ${style1} and ${style2}.
      `,
    },
  ],
  videoDescription: `${style1} x ${style2} type beat. Free for use.`,
  videoTags: ['hip hop', 'boom bap', 'type beat', 'free beats'],
  getTitle: (title: string) => {
    return `[FREE] ${style1} x ${style2} type beat - ${title}`;
  },
});

const typeBeatAvailableStyles = [
  'J Dilla',
  'Madlib',
  'Dr. Dre',
  'MF DOOM',
  'Kanye West',
  'DJ Premier',
  'Pete Rock',
  'RZA',
  'Timbaland',
  'Metro Boomin',
  'Alchemist',
  'Pharrell Williams',
  'Jazz-hop',
  'Trap',
  'Funky',
  'Eminem',
  'Nujabes',
  'Boom Bap',
  'Lo-fi',
];

export function getRandomTypeBeatStyles() {
  if (typeBeatAvailableStyles.length < 2) {
    throw new Error('El array debe tener al menos dos elementos');
  }

  const firstIndex = Math.floor(Math.random() * typeBeatAvailableStyles.length);
  let secondIndex = 0;

  do {
    secondIndex = Math.floor(Math.random() * typeBeatAvailableStyles.length);
  } while (secondIndex === firstIndex);

  return [
    typeBeatAvailableStyles[firstIndex],
    typeBeatAvailableStyles[secondIndex],
  ];
}
