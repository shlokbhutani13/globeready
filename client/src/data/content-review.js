// The honest review status of the guides, rules and glossary shown in the app. When a school official (DSO) or an
// immigration attorney has reviewed the content, record who and when here and the app says so instead of the default.
export const contentReview = {
  reviewedBy: null,   // for example "the international student office at <school>"
  reviewedOn: null,   // ISO date, for example "2026-11-02"
};

export function contentReviewNotice(review = contentReview) {
  if (review.reviewedBy && /^\d{4}-\d{2}-\d{2}$/.test(review.reviewedOn || "")) {
    return `Content reviewed by ${review.reviewedBy} on ${review.reviewedOn}. Rules change, so confirm with your DSO before you act.`;
  }
  return "This beta has not yet been reviewed by a school official or an immigration attorney. Treat it as a starting point and confirm with your DSO.";
}
