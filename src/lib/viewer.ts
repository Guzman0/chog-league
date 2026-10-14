// Who is making this request: a signed-in wallet (league) and/or a practice ID.
import { getSessionAddress } from "./session";
import { getPracticeId } from "./practice";

export async function getViewer() {
  const [wallet, practiceId] = await Promise.all([getSessionAddress(), getPracticeId()]);
  return { wallet, practiceId };
}
