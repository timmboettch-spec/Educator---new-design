import api from '../redux/api';
import config from '../redux/config';
import { updateStoredUser } from './storage';

export async function syncEducatorProfile(
  user: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  
  const rawRole = user['role'];
  const roleName = (
    typeof rawRole === 'string'
      ? rawRole
      : (rawRole as { role_name?: string } | null)?.role_name ?? ''
  ).toLowerCase();
  if (roleName !== 'educator') return user;

  try {
    const res = await api.get(`${config.GetEducatorAPI}/profile`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    const profile = (res.data?.data ?? res.data) as Record<string, unknown> | undefined;
    if (!profile) return user;

   
    const updates: Record<string, unknown> = {};
    if (Array.isArray(profile['schools'])) updates['schools'] = profile['schools'];
    if (typeof profile['status'] === 'string') updates['status'] = profile['status'];
    if (typeof profile['tokens'] === 'number') updates['tokens'] = profile['tokens'];
    if (typeof profile['full_name'] === 'string') updates['full_name'] = profile['full_name'];
    if (typeof profile['profile_picture'] === 'string' || profile['profile_picture'] === null) {
      updates['profile_picture'] = profile['profile_picture'];
    }

    if (Object.keys(updates).length === 0) return user;

    updateStoredUser(updates);

    return { ...user, ...updates };
  } catch {
 
    return user;
  }
}
