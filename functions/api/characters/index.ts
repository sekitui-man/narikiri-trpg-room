import { createCharacter, handleApiError, listCharacters } from '../../_shared/characterApi';

export const onRequestGet = async (context: any) => {
  try {
    return await listCharacters(context);
  } catch (error) {
    return handleApiError(error);
  }
};

export const onRequestPost = async (context: any) => {
  try {
    return await createCharacter(context);
  } catch (error) {
    return handleApiError(error);
  }
};
