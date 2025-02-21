import { z } from "zod";

export const Language = z.enum(["en", "pt-BR"]);
export type Language = z.infer<typeof Language>;

export const translations = {
  "en": {
    // Hero section
    "hero.title": "Search in public directory of multiple images for specific faces using AI Recognition!",
    "hero.subtitle": "First, provide a link from Google Drive or Microsoft OneDrive.",
    
    // Forms and inputs
    "url.placeholder": "Paste your OneDrive or Google Drive URL",
    "url.validation": "URL must be from OneDrive or Google Drive",
    "googleApiKey.label": "Google API Key",
    "googleApiKey.placeholder": "Enter your Google API Key",
    "googleApiKey.required": "Google API Key is required",
    "awsAccessKey.label": "AWS Access Key ID",
    "awsAccessKey.placeholder": "Enter AWS Access Key ID",
    "awsAccessKey.required": "AWS Access Key ID is required",
    "awsSecretKey.label": "AWS Secret Access Key",
    "awsSecretKey.placeholder": "Enter AWS Secret Access Key",
    "awsSecretKey.required": "AWS Secret Access Key is required",

    // Buttons
    "scan.button": "Start Scanning",
    "scan.loading": "Scanning...",
    "analyze.button": "Analyze Faces",
    "analyze.loading": "Analyzing...",

    // Messages
    "noImages.title": "No Images Found",
    "noImages.description": "The provided directory doesn't contain any compatible images.",
    "error.credentials": "Cloud storage access is not properly configured. Please check your credentials.",
    "error.generic": "An error occurred. Please try again.",
    "foundImages": "Found {count} Images",
    "uploadInstructions": "Upload a clear front-facing photo showing the entire face. Best results come from well-lit photos without sunglasses or masks.",
    "dropzoneText": "Drag & drop a face photo or click to select",

    // Results
    "results.title": "Analysis Results",
    "results.matchFound": "Match Found!",
    "results.noMatch": "No Match Found",
    "results.similarity": "Similarity: {similarity}%"
  },
  "pt-BR": {
    // Hero section
    "hero.title": "Pesquise em diretório público de múltiplas imagens por rostos específicos usando Reconhecimento por IA!",
    "hero.subtitle": "Primeiro, forneça um link do Google Drive ou Microsoft OneDrive.",
    
    // Forms and inputs
    "url.placeholder": "Cole a URL do OneDrive ou Google Drive",
    "url.validation": "A URL deve ser do OneDrive ou Google Drive",
    "googleApiKey.label": "Chave da API do Google",
    "googleApiKey.placeholder": "Digite sua chave da API do Google",
    "googleApiKey.required": "A chave da API do Google é obrigatória",
    "awsAccessKey.label": "ID da Chave de Acesso AWS",
    "awsAccessKey.placeholder": "Digite o ID da Chave de Acesso AWS",
    "awsAccessKey.required": "O ID da Chave de Acesso AWS é obrigatório",
    "awsSecretKey.label": "Chave de Acesso Secreta AWS",
    "awsSecretKey.placeholder": "Digite a Chave de Acesso Secreta AWS",
    "awsSecretKey.required": "A Chave de Acesso Secreta AWS é obrigatória",

    // Buttons
    "scan.button": "Iniciar Digitalização",
    "scan.loading": "Digitalizando...",
    "analyze.button": "Analisar Rostos",
    "analyze.loading": "Analisando...",

    // Messages
    "noImages.title": "Nenhuma Imagem Encontrada",
    "noImages.description": "O diretório fornecido não contém imagens compatíveis.",
    "error.credentials": "O acesso ao armazenamento na nuvem não está configurado corretamente. Verifique suas credenciais.",
    "error.generic": "Ocorreu um erro. Por favor, tente novamente.",
    "foundImages": "Encontradas {count} Imagens",
    "uploadInstructions": "Envie uma foto frontal nítida mostrando o rosto inteiro. Os melhores resultados vêm de fotos bem iluminadas sem óculos de sol ou máscaras.",
    "dropzoneText": "Arraste e solte uma foto do rosto ou clique para selecionar",

    // Results
    "results.title": "Resultados da Análise",
    "results.matchFound": "Correspondência Encontrada!",
    "results.noMatch": "Nenhuma Correspondência Encontrada",
    "results.similarity": "Similaridade: {similarity}%"
  }
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

export function getTranslation(key: TranslationKey, lang: Language, params?: Record<string, string | number>): string {
  const text = translations[lang][key];
  if (!params) return text;

  return Object.entries(params).reduce<string>(
    (acc, [key, value]) => acc.replace(`{${key}}`, String(value)),
    text
  );
}