import { z } from "zod";

export const Language = z.enum(["en", "pt-BR"]);
export type Language = z.infer<typeof Language>;

export const translations = {
  "en": {
    // Hero section
    "hero.title": "Easily find the people you’re looking for in a public image collection!",
    "hero.subtitle": "",
    
    // Forms and inputs
    "url.label": "Google Drive URL",
    "url.placeholder": "Enter a public Google Drive URL",
    "url.validation": "URL must be from Google Drive",
    "googleApiKey.label": "Google API Key",
    "googleApiKey.placeholder": "Enter a Google API Key",
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
    "submit": "Submit",

    // Messages
    "noImages.title": "No Images Found",
    "noImages.description": "The provided directory doesn't contain any compatible images.",
    "error.credentials": "Cloud storage access is not properly configured. Please check the credentials.",
    "error.generic": "An error occurred. Please try again.",
    "foundImages": "Found {count} Images",
    "uploadInstructions": "Upload a clear front-facing photo showing the entire face. Best results come from well-lit photos without sunglasses or masks.",
    "dropzoneText": "Drag & drop a face photo or click to select",

    // Results
    "results.title": "Analysis Results",
    "results.matchFound": "Match Found!",
    "results.noMatch": "No Match Found",
    "results.similarity": "Similarity: {similarity}%",
    "results.analysisComplete": "Analysis Complete",
    "results.foundMatches": "Found {matchCount} matches in {totalCount} images",
    "results.matchedImages": "Matched Images",
    "results.downloadCSV": "Download CSV",
    "results.image": "Image #{id}",
    "results.similarityPercentage": "{value}% similarity",
    "results.noResultsAvailable": "No results available"
  },
  "pt-BR": {
    // Hero section
    "hero.title": "Encontre facilmente as pessoas que você está procurando em uma coleção pública de imagens!",
    "hero.subtitle": "",
    
    // Forms and inputs
    "url.label": "URL do Google Drive",
    "url.placeholder": "Adicione uma URL pública do Google Drive",
    "url.validation": "A URL deve ser do Google Drive",
    "googleApiKey.label": "Chave da API do Google",
    "googleApiKey.placeholder": "Adicione uma chave da API do Google",
    "googleApiKey.required": "A chave da API do Google é obrigatória",
    "awsAccessKey.label": "ID da Chave de Acesso AWS",
    "awsAccessKey.placeholder": "Adicione o ID da Chave de Acesso AWS",
    "awsAccessKey.required": "O ID da Chave de Acesso AWS é obrigatório",
    "awsSecretKey.label": "Chave de Acesso Secreta AWS",
    "awsSecretKey.placeholder": "Adicione a Chave de Acesso Secreta AWS",
    "awsSecretKey.required": "A Chave de Acesso Secreta AWS é obrigatória",

    // Buttons
    "scan.button": "Iniciar mapeamento",
    "scan.loading": "Mapeando...",
    "analyze.button": "Analisar Rostos",
    "analyze.loading": "Analisando...",
    "submit": "Enviar",

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
    "results.similarity": "Similaridade: {similarity}%",
    "results.analysisComplete": "Análise Completa",
    "results.foundMatches": "Encontrados {matchCount} correspondências em {totalCount} imagens",
    "results.matchedImages": "Imagens Correspondentes",
    "results.downloadCSV": "Baixar CSV",
    "results.image": "Imagem #{id}",
    "results.similarityPercentage": "{value}% de similaridade",
    "results.noResultsAvailable": "Nenhum resultado disponível"
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