// The one tag clippers can set themselves — at submission, or later from
// their clip page — to disclose that a post is a paid / sponsored
// placement. It's an ordinary topic-kind clip_tags row seeded by migration
// 0025; this slug is how the app finds it. If an admin deletes the row the
// clipper-side controls disappear rather than erroring.
export const SPONSORED_TAG_SLUG = "sponsored";
