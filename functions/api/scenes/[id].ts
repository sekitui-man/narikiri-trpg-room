import { deleteScene, handleApiError, updateScene } from '../../_shared/roomApi';

export const onRequestPatch = async (context: any) => {
  try {
    return await updateScene(context);
  } catch (error) {
    return handleApiError(error);
  }
};

export const onRequestDelete = async (context: any) => {
  try {
    return await deleteScene(context);
  } catch (error) {
    return handleApiError(error);
  }
};
