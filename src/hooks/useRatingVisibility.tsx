export function useRatingVisibility() {
  // All users can see rating by default in local mode
  const canSeeRating = true;
  const roleCanSeeRating = true;
  const positionCanSeeRating = true;

  return {
    canSeeRating,
    roleCanSeeRating,
    positionCanSeeRating,
    isLoading: false,
  };
}
