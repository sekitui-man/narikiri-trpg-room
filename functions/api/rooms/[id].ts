import { deleteRoom, handleApiError, updateRoom } from '../../_shared/roomApi';

export const onRequestPatch = async (context: any) => {
  try {
    return await updateRoom(context);
  } catch (error) {
    return handleApiError(error);
  }
};

export const onRequestDelete = async (context: any) => {
  try {
    return await deleteRoom(context);
  } catch (error) {
    return handleApiError(error);
  }
};
