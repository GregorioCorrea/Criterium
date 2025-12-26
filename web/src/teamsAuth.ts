import * as microsoftTeams from "@microsoft/teams-js";

let initialized = false;

export async function getTeamsToken(): Promise<string | null> {
  try {
    if (!initialized) {
      await microsoftTeams.app.initialize();
      initialized = true;
    }
    const token = await microsoftTeams.authentication.getAuthToken();
    return token;
  } catch (e) {
    console.warn("[teams] getAuthToken failed", e);
    return null; // fallback: modo web normal sin SSO
  }
}
