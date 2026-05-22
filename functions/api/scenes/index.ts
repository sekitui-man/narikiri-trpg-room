import { createScene, handleApiError } from '../../_shared/roomApi';

export const onRequestPost = async (context: any) => {
  try {
    return await createScene(context);
  } catch (error) {
    return handleApiError(error);
  }
};
