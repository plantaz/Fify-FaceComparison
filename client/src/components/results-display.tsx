import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";

interface Result {
  imageId: number;
  similarity: number;
  matched: boolean;
}

interface ResultsDisplayProps {
  results: Result[] | null;
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  if (!results) {
    return (
      <div className="text-center">
        <p className="text-muted-foreground">No results available</p>
      </div>
    );
  }

  const matchedCount = results.filter(r => r.matched).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">
          Analysis Complete
        </h2>
        <p className="text-muted-foreground">
          Found {matchedCount} matches in {results.length} images
        </p>
      </div>

      <div className="grid gap-4">
        {results.map((result) => (
          <Card key={result.imageId}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Image #{result.imageId}</p>
                <p className="text-sm text-muted-foreground">
                  {result.similarity.toFixed(1)}% similarity
                </p>
              </div>

              {result.matched ? (
                <Check className="h-6 w-6 text-green-500" />
              ) : (
                <X className="h-6 w-6 text-destructive" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}