export type StyleCategory = '2d' | '3d' | 'realistis'

export interface VisualStyle {
  id: string
  name: string
  category: StyleCategory
  niche: string
  /** Tile colors used for the picker until a real sample image exists. */
  swatch: string
  ink: string
  /** Appended to every image prompt in the project. */
  prompt: string
  /** How characters should look on the character sheet. */
  characterHint: string
  /** A rule for the visual planner when the style changes what characters are (e.g. animals in a fable). */
  planHint?: string
}

export const STYLE_CATEGORIES: { id: StyleCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'realistis', label: 'Realistis' }
]

const NO_TEXT = 'No text, no letters, no captions, no watermark, no logo.'

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: 'stickman',
    name: 'Stickman berwarna',
    category: '2d',
    niche: 'Sejarah, kisah nyata',
    swatch: '#F2B266',
    ink: '#1F1D1A',
    prompt:
      '2D flat vector illustration frame for a YouTube storytelling video. Colorful, detailed flat background (never plain white). ALL characters are simple STICKMAN figures: thin black line bodies, arms and legs, plain round white heads with minimal cartoon faces (dot eyes, small eyebrows, simple mouth), no realistic anatomy. Each stickman wears only small costume pieces that match their role (hat, crown, sash, headcloth, props) while the stick body stays visible. Clean bold outlines, flat colors with light soft shading, every character in the same consistent stickman style, cinematic composition with depth. ' +
      NO_TEXT,
    characterHint: 'a stickman figure with a round white head and thin black line limbs, wearing role-specific costume pieces'
  },
  {
    id: 'flat',
    name: 'Kartun flat',
    category: '2d',
    niche: 'Sains, fakta, edukasi',
    swatch: '#8CCBE3',
    ink: '#1F1D1A',
    prompt:
      'Flat vector explainer illustration, bold geometric shapes, a limited harmonious color palette, clean lines, friendly cartoon characters with simple features, soft subtle grain texture, clear readable composition. ' +
      NO_TEXT,
    characterHint: 'a friendly flat vector cartoon character with simple geometric features'
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard doodle',
    category: '2d',
    niche: 'Tutorial, bisnis',
    swatch: '#FFFFFF',
    ink: '#1F1D1A',
    prompt:
      'Hand-drawn whiteboard doodle, black marker line art on a clean white board, one accent color used sparingly (red or blue), simple sketchy characters, arrows and small icons, like a whiteboard animation explainer. ' +
      NO_TEXT,
    characterHint: 'a simple hand-drawn marker doodle character'
  },
  {
    id: 'collage',
    name: 'Kolase kertas',
    category: '2d',
    niche: 'Dokumenter, jurnalisme',
    swatch: '#E9D8BA',
    ink: '#1F1D1A',
    prompt:
      'Paper cut-out collage, layered textured paper, vintage photo cutouts, halftone print textures, torn edges, soft shadows between paper layers, editorial documentary style. ' +
      NO_TEXT,
    characterHint: 'a paper cut-out collage figure with textured paper layers'
  },
  {
    id: 'watercolor',
    name: 'Buku cerita cat air',
    category: '2d',
    niche: 'Dongeng anak, religi',
    swatch: '#CFE3B5',
    ink: '#1F1D1A',
    prompt:
      "Children's storybook watercolor illustration, soft washes on textured paper, warm pastel palette, cute expressive characters, whimsical and cozy mood. " +
      NO_TEXT,
    characterHint: 'a cute storybook watercolor character'
  },
  {
    id: 'anime',
    name: 'Anime',
    category: '2d',
    niche: 'Drama, motivasi, fiksi',
    swatch: '#F5C3CD',
    ink: '#1F1D1A',
    prompt:
      'High-quality anime film still, clean cel shading, expressive characters, detailed painted background, cinematic lighting and color. ' +
      NO_TEXT,
    characterHint: 'an anime character with clean cel shading'
  },
  {
    id: 'animepaint',
    name: 'Anime lukisan tangan',
    category: '2d',
    niche: 'Petualangan, keluarga, slice of life',
    swatch: '#9CC9A5',
    ink: '#1F1D1A',
    // Described by its look rather than a studio name: some image models refuse studio names, and the look is what matters.
    prompt:
      'Hand-painted 2D anime feature film still in the classic Japanese animation tradition: soft gouache and watercolor painted backgrounds full of lush detailed nature, fluffy cumulus clouds, warm natural sunlight, a gentle slightly muted pastel palette, simple rounded character designs with small expressive eyes and soft cel shading, a nostalgic, whimsical and calm atmosphere, cinematic wide composition. ' +
      NO_TEXT,
    characterHint: 'a gently rounded hand-painted 2D anime film character with soft cel shading'
  },
  {
    id: 'chibi',
    name: 'Chibi lucu',
    category: '2d',
    niche: 'Anak, komedi, kawaii',
    swatch: '#FFC6DD',
    ink: '#1F1D1A',
    prompt:
      'Cute chibi kawaii illustration: characters with oversized heads about a third of their height, tiny bodies, big sparkling eyes and blush cheeks, soft pastel colors, rounded shapes, clean thick outlines, a cheerful simple background. ' +
      NO_TEXT,
    characterHint: 'a cute chibi character with an oversized head, tiny body and big sparkling eyes'
  },
  {
    id: 'manga',
    name: 'Manga hitam putih',
    category: '2d',
    niche: 'Drama, aksi, misteri',
    swatch: '#E6E2DA',
    ink: '#1F1D1A',
    prompt:
      'Black and white manga panel, crisp ink line art, screentone shading, speed lines for motion, dramatic close-ups and angles, high contrast, Japanese comic book style, no color. ' +
      NO_TEXT,
    characterHint: 'a black and white manga character drawn in crisp ink with screentone shading'
  },
  {
    id: 'fable',
    name: 'Fabel kartun hewan',
    category: '2d',
    niche: 'Fabel, dongeng anak',
    swatch: '#B8D98C',
    ink: '#1F1D1A',
    prompt:
      "Warm 2D storybook cartoon of a fable: the characters are anthropomorphic animals with expressive faces and big readable eyes, simple clothing or props that fit their role, soft rounded shapes, clean outlines, cozy painted nature backgrounds such as forests, rivers, rice fields and villages, bright friendly colors, gentle soft lighting, a children's picture-book feel. " +
      NO_TEXT,
    characterHint: 'an anthropomorphic cartoon animal with an expressive face, wearing simple role-specific clothes or props',
    planHint:
      'This is a fable: every named character is an anthropomorphic animal, never a human. In each identity, write a specific animal species that fits the role and personality (for example "a young mouse-deer", "an old wise owl", "a proud tiger"), with its fur or feather colors and size, and whether it walks upright. Settings are places where these animals live.'
  },
  {
    id: 'wayang',
    name: 'Wayang & batik',
    category: '2d',
    niche: 'Cerita rakyat, legenda Nusantara',
    swatch: '#C8873E',
    ink: '#1F1D1A',
    prompt:
      'Indonesian wayang kulit inspired illustration: characters drawn as ornate flat shadow-puppet figures with intricately carved filigree patterns, elegant elongated limbs and stylized profiles, a palette of gold, deep red, indigo and black, batik-patterned backgrounds with traditional motifs, warm oil-lamp glow, layered stage-like composition. ' +
      NO_TEXT,
    characterHint: 'an ornate wayang kulit shadow-puppet figure with carved filigree patterns and gold details'
  },
  {
    id: 'horror',
    name: 'Ilustrasi horor',
    category: '2d',
    niche: 'Horor, cerita misteri',
    swatch: '#3B4A47',
    ink: '#FAF7F2',
    prompt:
      'Dark eerie horror illustration, painterly digital art, desaturated cold palette with deep shadows, mist, dim moonlight or a single flickering light source, unsettling atmosphere, subtle film grain, suspenseful framing, frightening but never gory. ' +
      NO_TEXT,
    characterHint: 'a character in a dark eerie painterly horror illustration, lit by dim cold light'
  },
  {
    id: 'popart',
    name: 'Komik pop art',
    category: '2d',
    niche: 'Aksi, motivasi, pahlawan',
    swatch: '#FFD23F',
    ink: '#1F1D1A',
    prompt:
      'Bold comic book pop art illustration: thick black ink outlines, bright primary colors, halftone dot shading, dynamic heroic poses, dramatic angles and an energetic action composition. ' +
      NO_TEXT,
    characterHint: 'a bold pop art comic book character with thick ink outlines and halftone shading'
  },
  {
    id: 'kamasan',
    name: 'Lukisan Kamasan Bali',
    category: '2d',
    niche: 'Legenda Bali, Ramayana, Mahabharata',
    swatch: '#C96A3C',
    ink: '#1F1D1A',
    prompt:
      'Traditional Balinese Kamasan painting: flat two-dimensional figures with stylized faces and ornate golden headdresses, fine black outlines, earthy natural pigments of ochre, red, indigo and cream on aged cloth texture, densely patterned decorative backgrounds of clouds, flames and flowers, a narrative scene composition. ' +
      NO_TEXT,
    characterHint: 'a traditional Balinese Kamasan painted figure with an ornate headdress and fine black outlines'
  },
  {
    id: 'retro90',
    name: 'Kartun retro 90-an',
    category: '2d',
    niche: 'Nostalgia, komedi, keluarga',
    swatch: '#7FD1C7',
    ink: '#1F1D1A',
    prompt:
      'Classic 1990s TV cartoon style: hand-inked slightly uneven outlines, flat cel colors with a gently faded palette, simple painted backgrounds, exaggerated expressive characters, subtle film grain. ' +
      NO_TEXT,
    characterHint: 'an exaggerated, expressive 1990s TV cartoon character with hand-inked outlines'
  },
  {
    id: 'ukiyoe',
    name: 'Ukiyo-e Jepang',
    category: '2d',
    niche: 'Legenda Jepang, samurai, sejarah',
    swatch: '#2F4F7F',
    ink: '#FAF7F2',
    prompt:
      'Japanese ukiyo-e woodblock print: bold flowing outlines, flat areas of color in indigo, vermilion and muted earth tones, textured washi paper grain, stylized waves, clouds and landscapes, an elegant balanced composition. ' +
      NO_TEXT,
    characterHint: 'a figure drawn as a Japanese ukiyo-e woodblock print with bold flowing outlines'
  },
  {
    id: 'noir',
    name: 'Komik noir',
    category: '2d',
    niche: 'Horor, true crime',
    swatch: '#2F3240',
    ink: '#FAF7F2',
    prompt:
      'Dark graphic-novel comic panel, heavy black ink shadows, high contrast, muted palette with a single accent color, dramatic angles, halftone texture, suspenseful mood. ' +
      NO_TEXT,
    characterHint: 'a graphic-novel character drawn with heavy ink shadows'
  },
  {
    id: 'pixel',
    name: 'Pixel art',
    category: '2d',
    niche: 'Gaming, nostalgia',
    swatch: '#8FD694',
    ink: '#1F1D1A',
    prompt: 'Detailed 16-bit pixel art scene, crisp pixels, limited retro palette, video game aesthetic, no blur. ' + NO_TEXT,
    characterHint: 'a 16-bit pixel art character sprite'
  },
  {
    id: 'animation3d',
    name: 'Animasi 3D',
    category: '3d',
    niche: 'Fabel, keluarga, anak',
    swatch: '#FFD66B',
    ink: '#1F1D1A',
    prompt:
      '3D animated feature film render, stylized characters with big expressive faces, soft global illumination, subsurface scattering, vibrant colors, cinematic depth of field. ' +
      NO_TEXT,
    characterHint: 'a stylized 3D animated film character with an expressive face'
  },
  {
    id: 'clay',
    name: 'Claymation',
    category: '3d',
    niche: 'Komedi, cerita anak',
    swatch: '#F4A988',
    ink: '#1F1D1A',
    prompt:
      'Claymation stop-motion scene, handcrafted plasticine characters and miniature sets, visible fingerprints and clay texture, soft studio lighting. ' +
      NO_TEXT,
    characterHint: 'a handcrafted plasticine clay character'
  },
  {
    id: 'papercraft',
    name: 'Stop-motion kertas 3D',
    category: '3d',
    niche: 'Dongeng, cerita anak',
    swatch: '#F6C28B',
    ink: '#1F1D1A',
    prompt:
      'Handcrafted paper stop-motion diorama: characters and sets built from folded and cut colored paper and cardboard with visible paper grain, layered depth, soft warm studio lighting with gentle shadows, a miniature theater feel. ' +
      NO_TEXT,
    characterHint: 'a handcrafted character made of folded and cut colored paper'
  },
  {
    id: 'lowpoly',
    name: 'Low-poly 3D',
    category: '3d',
    niche: 'Teknologi, sains',
    swatch: '#A7C7E7',
    ink: '#1F1D1A',
    prompt:
      'Low-poly 3D render, faceted geometric shapes, flat-shaded polygons, clean pastel colors, soft ambient lighting. ' + NO_TEXT,
    characterHint: 'a low-poly 3D character with faceted shapes'
  },
  {
    id: 'diorama',
    name: 'Diorama miniatur',
    category: '3d',
    niche: 'Sejarah, kota, perang',
    swatch: '#C9D9A6',
    ink: '#1F1D1A',
    prompt:
      'Tilt-shift miniature diorama, tiny detailed 3D figures and buildings, shallow depth of field, soft daylight, toy-like scale. ' +
      NO_TEXT,
    characterHint: 'a tiny detailed miniature figurine'
  },
  {
    id: 'cinematic',
    name: 'Sinematik realistis',
    category: 'realistis',
    niche: 'Misteri, sejarah, drama',
    swatch: '#56607A',
    ink: '#FAF7F2',
    prompt:
      'Photorealistic cinematic film still, dramatic natural lighting, shallow depth of field, anamorphic lens look, rich color grading, subtle 35mm film grain. ' +
      NO_TEXT,
    characterHint: 'a photorealistic person, cinematic lighting'
  },
  {
    id: 'documentary',
    name: 'Foto dokumenter',
    category: 'realistis',
    niche: 'Fakta, berita, alam',
    swatch: '#8A9A7B',
    ink: '#FAF7F2',
    prompt:
      'Realistic documentary photograph, natural light, authentic details, candid composition, high detail, true-to-life colors. ' +
      NO_TEXT,
    characterHint: 'a realistic documentary portrait of a person'
  },
  {
    id: 'archival',
    name: 'Arsip sejarah',
    category: 'realistis',
    niche: 'Sejarah, perang, tokoh',
    swatch: '#B9A488',
    ink: '#1F1D1A',
    prompt:
      'Vintage archival photograph, faded sepia or black and white, film grain, light scratches and dust, historical documentary look. ' +
      NO_TEXT,
    characterHint: 'a person in a vintage archival sepia photograph'
  },
  {
    id: 'oilpaint',
    name: 'Lukisan cat minyak',
    category: 'realistis',
    niche: 'Sejarah, religi, tokoh besar',
    swatch: '#8C5A3C',
    ink: '#FAF7F2',
    prompt:
      'Classical oil painting in the manner of the old masters, visible brush strokes and canvas texture, rich warm chiaroscuro lighting, deep earthy colors, dramatic yet balanced composition, museum-quality fine art. ' +
      NO_TEXT,
    characterHint: 'a person painted as a classical oil portrait with visible brush strokes'
  },
  {
    id: 'epic',
    name: 'Fantasi epik',
    category: 'realistis',
    niche: 'Mitologi, legenda',
    swatch: '#6C5B8E',
    ink: '#FAF7F2',
    prompt:
      'Epic realistic fantasy concept art, highly detailed, volumetric light, grand scale, painterly realism, cinematic composition. ' +
      NO_TEXT,
    characterHint: 'an epic realistic fantasy character, concept art'
  }
]

export function getStyle(id: string): VisualStyle {
  return VISUAL_STYLES.find((s) => s.id === id) ?? VISUAL_STYLES[0]
}
