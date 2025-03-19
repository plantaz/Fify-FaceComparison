import { useState } from "react";
import { type ScanJob } from "@shared/schema";
import UrlForm from "@/components/url-form";
import FaceUpload from "@/components/face-upload";
import ResultsDisplay from "@/components/results-display";
import HeroSection from "@/components/hero-section";

export default function HomePage() {
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState<string>("");

  const handleScanComplete = (job: ScanJob, apiKey: string) => {
    setScanJob(job);
    setGoogleApiKey(apiKey);
  };

  const handleAnalysisComplete = () => {
    setAnalysisComplete(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        {!scanJob ? (
          <UrlForm onScanComplete={handleScanComplete} />
        ) : !analysisComplete ? (
          <FaceUpload
            jobId={scanJob.id}
            imageCount={scanJob.imageCount}
            onAnalysisComplete={handleAnalysisComplete}
            setScanJob={setScanJob}
            googleApiKey={googleApiKey}
          />
        ) : (
          <ResultsDisplay results={Array.isArray(scanJob.results) ? scanJob.results : null} />
        )}
      </div>
    </div>
  );
}
