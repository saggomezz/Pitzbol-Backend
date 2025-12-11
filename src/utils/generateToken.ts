import jwt from "jsonwebtoken";

export const generateToken = (uid: string) => {
  return jwt.sign({ uid }, process.env.JWT_SECRET || "secreto123", {
    expiresIn: "7d",
  });
};
