import { getAiSeats } from './normalizeAuthUser';
import { getParsedUser } from './storage';

type ApplyUserDataProps = {
  setFullName: React.Dispatch<React.SetStateAction<string>>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setProfileImage: React.Dispatch<React.SetStateAction<string>>;
  setRole: React.Dispatch<React.SetStateAction<string>>;
  setOriginalData: React.Dispatch<
    React.SetStateAction<{ fullName: string; profileImage: string }>
  >;
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
  }: ApplyUserDataProps
) => {
  const localUser = getParsedUser() ?? {};
  // A response without a name must not wipe the one already shown.
  const name =
    (user?.full_name as string) ||
    (user?.fullname as string) ||
    (localUser?.full_name as string) ||
    '';
  const image =
    (user?.profile_picture as string) ||
    (localUser?.profile_picture as string) ||
    '';
  const roleValue = user?.role;
  const roleName =
    typeof roleValue === 'string'
      ? roleValue
      : (roleValue as Record<string, string>)?.role_name ||
        (localUser?.role as string) ||
        '';

  setFullName(name);
  setEmail((user.email as string) || '');
  setProfileImage(image);
  setRole(roleName);
  setOriginalData({ fullName: name, profileImage: image });

  // Seat usage comes pre-computed from the backend for both roles.
  const seats = getAiSeats(user);
  const purchased = seats.total;
  const remaining = seats.available;
  const consumed = seats.consumed;
  const percentage =
    purchased > 0 ? Math.min((consumed / purchased) * 100, 100) : 0;
  setTokenData({ purchased, consumed, remaining, percentage });
};
