import { describe, expect, it } from "vitest";

import { registerKomekCommand } from "../../src/commands/komek";
import { commandHandler, fakeContext } from "./harness";

const HELP = `Komandalar:
/start - botu başladır və bildirişləri aktiv edir
/ixtisas <mətn> - ixtisas əlavə edir (məs: /ixtisas musiqi müəllimi)
/ixtisaslar - ixtisaslarınızı göstərir
/sil <mətn> - ixtisas silir
/axtar - indi axtarır və uyğun bütün vakansiyaları göndərir
/stop - bildirişləri dayandırır`;

describe("/komek", () => {
  it("replies with the command list", async () => {
    const handler = commandHandler(registerKomekCommand, "komek");
    const { ctx, reply } = fakeContext({ from: { id: 1 }, text: "/komek" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(HELP);
  });

  it("replies even when the update carries no sender", async () => {
    const handler = commandHandler(registerKomekCommand, "komek");
    const { ctx, reply } = fakeContext({ text: "/komek" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(HELP);
  });
});
