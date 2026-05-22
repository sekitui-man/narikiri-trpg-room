import { deleteMessage, handleApiError, updateMessage } from '../../_shared/roomApi';

export const onRequestPatch = async (context: any) => {
  try {
    return await updateMessage(context);
  } catch (error) {
    return handleApiError(error);
  }
};

export const onRequestDelete = async (context: any) => {
  try {
    return await deleteMessage(context);
  } catch (error) {
    return handleApiError(error);
  }
};
