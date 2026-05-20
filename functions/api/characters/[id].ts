import { handleApiError, updateCharacter } from '../../_shared/characterApi';

export const onRequestPatch = async (context: any) => {
  try {
    return await updateCharacter(context);
  } catch (error) {
    return handleApiError(error);
  }
};
