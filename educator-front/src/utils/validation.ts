export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email);

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,20}$/;

export const isValidPassword = (password: string): boolean => PASSWORD_REGEX.test(password);

export const PROFILE_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'] as const;
export const PROFILE_IMAGE_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'svg'] as const;

export const getFileExtension = (fileName: string): string => {
	const extension = fileName.split('.').pop();
	return extension ? extension.toLowerCase() : '';
};

export const isValidProfileImageMimeType = (mimeType: string): boolean =>
	PROFILE_IMAGE_ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase() as (typeof PROFILE_IMAGE_ALLOWED_MIME_TYPES)[number]);

export const isValidProfileImageExtension = (fileName: string): boolean =>
	PROFILE_IMAGE_ALLOWED_EXTENSIONS.includes(getFileExtension(fileName) as (typeof PROFILE_IMAGE_ALLOWED_EXTENSIONS)[number]);

export const isValidProfileImageFile = (file: File): boolean => {
	const hasValidExtension = isValidProfileImageExtension(file.name);
	const hasValidMimeType = isValidProfileImageMimeType(file.type);

	return hasValidExtension && hasValidMimeType;
};
