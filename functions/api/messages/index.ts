import { createMessage, handleApiError } from '../../_shared/roomApi';

export const onRequestPost = async (context: any) => {
  try {
    return await createMessage(context);
  } catch (error) {
    return handleApiError(error);
  }
};
