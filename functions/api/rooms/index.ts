import { createRoom, handleApiError } from '../../_shared/roomApi';

export const onRequestPost = async (context: any) => {
  try {
    return await createRoom(context);
  } catch (error) {
    return handleApiError(error);
  }
};
