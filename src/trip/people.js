// How people on a shared trip are shown. There are no display names (sign-up
// asks only for an email), so: "You", else the part of the email before the @.
export function personName(members, userId, meId) {
  if (userId && userId === meId) return "You";
  const m = members.find((x) => x.user_id === userId);
  return m ? m.email.split("@")[0] : "Someone who left";
}
