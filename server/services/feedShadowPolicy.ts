export function shouldWriteSupabaseFeedItemShadow(input: {
  primaryEnabled: boolean;
}) {
  return !input.primaryEnabled;
}
