import { InlineKeyboard } from "grammy/web";

/** Callback data of a delete button: the list owner's id, then the percent-encoded field. */
export const DELETE_FIELD_DATA = /^delete_field:(\d+):(.+)$/;

export function fieldListKeyboard(
  fields: readonly { telegramId: number; field: string; rawField: string }[],
): InlineKeyboard | undefined {
  const keyboard = new InlineKeyboard();
  let added = false;

  for (const field of fields) {
    const data = `delete_field:${field.telegramId}:${encodeURIComponent(field.field)}`;

    if (data.length > 64) {
      continue;
    }

    keyboard.text(`Sil: ${field.rawField}`, data).row();
    added = true;
  }

  return added ? keyboard : undefined;
}
