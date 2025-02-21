import { useState } from "react";
import { type ScanJob } from "@shared/schema";
import UrlForm from "@/components/url-form";
import FaceUpload from "@/components/face-upload";
import ResultsDisplay from "@/components/results-display";
import HeroSection from "@/components/hero-section";

export default function Home() {
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [googleApiKey, setGoogleApiKey] = useState<string>("");
  const [isAnalysisComplete, setIsAnalysisComplete] = useState(false);

  const handleScanComplete = (job: ScanJob, apiKey: string) => {
    console.log("Scan complete with API key:", apiKey); // Debug log
    setScanJob(job);
    setGoogleApiKey(apiKey);
  };

  return (
    <div className="container py-8 space-y-8">
      <HeroSection />
      {!scanJob ? (
        <UrlForm onScanComplete={handleScanComplete} />
      ) : !isAnalysisComplete ? (
        <FaceUpload
          jobId={scanJob.id}
          imageCount={scanJob.imageCount}
          onAnalysisComplete={() => setIsAnalysisComplete(true)}
          setScanJob={setScanJob}
          googleApiKey={googleApiKey}
        />
      ) : (
        <ResultsDisplay scanJob={scanJob} />
      )}
    </div>
  );
}