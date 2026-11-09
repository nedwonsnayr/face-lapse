import { createContext, useContext } from "react";
import { createProfileApi } from "./api";

export const ProfileApiContext = createContext(createProfileApi(1));
export const useProfileApi = () => useContext(ProfileApiContext);
