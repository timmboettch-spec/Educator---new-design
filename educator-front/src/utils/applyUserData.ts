import { getParsedUser } from './storage';

type ApplyUserDataProps = {
  setFullName: React.Dispatch<React.SetStateAction<string>>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setProfileImage: React.Dispatch<React.SetStateAction<string>>;
  setRole: React.Dispatch<React.SetStateAction<string>>;
  setOriginalData: React.Dispatch<React.SetStateAction<{ fullName: string; profileImage: string }>>;
  setTokenData: React.Dispatch<
    React.SetStateAction<{
      purchased: number;
      consumed: number;
      remaining: number;
      percentage: number;
    }>
  >;
};

export const ApplyUserData = (
  user: Record<string, unknown>,
  {
    setFullName,
    setEmail,
    setProfileImage,
    setRole,
    setOriginalData,
    setTokenData,
  }: ApplyUserDataProps,
) => {
  const name = (user?.full_name as string) || '';
  const image = (user?.profile_picture as string) || (user?.profile_image as string) || '';
  const localUser = getParsedUser() ?? {};
  const roleValue = user?.role;
  const roleName =
    typeof roleValue === 'string'
      ? roleValue
      : (roleValue as Record<string, string>)?.role_name || (localUser?.role as string) || '';

  setFullName(name);
  setEmail((user.email as string) || '');
  setProfileImage(image);
  setRole(roleName);
  setOriginalData({ fullName: name, profileImage: image });

  let purchased = 0,
    remaining = 0,
    consumed = 0;

  if (roleName === 'District Admin') {
    const subscriptions = (user?.subscriptions as Record<string, number>[]) || [];
    purchased = subscriptions.reduce((total, sub) => total + (sub?.ai_seats || 0), 0);
    remaining = subscriptions.reduce((total, sub) => total + (sub?.seats_available || 0), 0);
    consumed = purchased - remaining;
  } else {
    consumed = Number(user?.total_tokens) || Number(user?.allocated_tokens) || 0;
    remaining = Number(user?.tokens) || 0;
    purchased = consumed + remaining;
  }
  const percentage = purchased > 0 ? Math.min((consumed / purchased) * 100, 100) : 0;
  setTokenData({ purchased, consumed, remaining, percentage });
};
