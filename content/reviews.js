// Real reviews, copied by hand from the Google Business Profile.
//
// This is the list that matters for AI crawlers: the build writes these cards
// into the HTML, and a review that only exists after a fetch at runtime is one
// they never see. /api/reviews replaces them at runtime when a key is set.
//
// Rules, and they are not negotiable:
//   - Nothing invented. Ever. An invented testimonial is a lie told to somebody
//     deciding whether to let a stranger into their home.
//   - Reproduce the text exactly, typos included. Tidying somebody's words
//     makes them yours.
//   - No star average and no review count anywhere in the visible copy, and no
//     aggregateRating in the structured data. Google's review snippet
//     guidelines exclude ratings aggregated from another site, so marking up a
//     Google score to win stars in Google's own results is not eligible and
//     risks a manual action.
//
// Below five entries the whole section ships empty and hidden, because a page
// with a thin set is better off with no review section than a thin one.

export const reviews = [];

export const REVIEW_FLOOR = 5;
