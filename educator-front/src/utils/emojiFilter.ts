const SKIN_TONE = '(?:\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF})';
const LEFTOVER =
  '(?:\u200D|\uFE0F|\u20E3|\uFE0E|\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF})';

const EMOJI_PATTERN = new RegExp(
  `\\p{Extended_Pictographic}(?:${SKIN_TONE}|\\uFE0F)?(?:\\u200D\\p{Extended_Pictographic}(?:${SKIN_TONE}|\\uFE0F)?)*|[\\u{1F1E0}-\\u{1F1FF}]{2}|[#*0-9]\\uFE0F\\u20E3|${LEFTOVER}`,
  'gu'
);

export const stripEmoji = (text: string): string => {
  EMOJI_PATTERN.lastIndex = 0;
  return text.replace(EMOJI_PATTERN, '');
};

export const containsEmoji = (text: string): boolean => {
  EMOJI_PATTERN.lastIndex = 0;
  return EMOJI_PATTERN.test(text);
};

export const extractClipboardText = (
  clipboardData: DataTransfer
): string | null => {
  const htmlData = clipboardData.getData('text/html');

  if (htmlData) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');

    doc.querySelectorAll('img').forEach((img) => img.remove());

    const textContent = (doc.body.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    const cleaned = stripEmoji(textContent);

    if (cleaned === '') {
      return null;
    }

    return cleaned;
  }

  const plainText = clipboardData.getData('text/plain');
  return stripEmoji(plainText);
};
