import { handleApiError, updateRoom } from '../../_shared/roomApi';

export const onRequestPatch = async (context: any) => {
  try {
    return await updateRoom(context);
  } catch (error) {
    return handleApiError(error);
  }
};
