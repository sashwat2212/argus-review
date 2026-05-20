import { useState } from 'react';
import { ReviewDetail } from '../components/ReviewDetail';
import { ReviewList } from '../components/ReviewList';

export function ReviewsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return <ReviewDetail reviewId={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return <ReviewList onSelect={setSelectedId} />;
}
