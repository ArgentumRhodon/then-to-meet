/** The signed-in user, as far as the app needs to know. */
export interface SessionUser {
	uid: string;
	name: string | null;
	email: string | null;
	picture: string | null;
}
