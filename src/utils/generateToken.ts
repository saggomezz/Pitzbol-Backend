import jwt from "jsonwebtoken";

const { JWT_SECRET } = process.env;

export const generateToken = (
  uid: string,
  email?: string,
  role?: string
) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET no definido en el entorno");
  }
  return jwt.sign(
    { uid, email, role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};
