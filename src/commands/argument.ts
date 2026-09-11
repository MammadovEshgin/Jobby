/** The text a user typed after a command, with the "/cmd" or "/cmd@BotName" prefix removed. */
export function commandArgument(text: string, command: string): string {
  return text.replace(new RegExp(`^/${command}(?:@\\w+)?\\s*`, "i"), "").trim();
}
