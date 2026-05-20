import { archiveCharacter, handleApiError } from '../../../_shared/characterApi';

export const onRequestPost = async (context: any) => {
  try {
    return await archiveCharacter(context);
  } catch (error) {
    return handleApiError(error);
  }
};
