import { getSecret } from './secrets';
import { getServerUrl } from './server';

export async function createGroup({ groupName, memberKeyIds }: {
  groupName: string,
  memberKeyIds: string,
}) {
  try {
    const token = await getSecret('token');
    if (!token) {
      return { success: false, error: 'No token found. Please request a token first.' };
    }
    const serverUrl = getServerUrl();
    const response = await fetch(`${serverUrl}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: groupName,
        memberKeyIds: memberKeyIds.split(',').map(id => id.trim())
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: `Failed to create group: ${errorData.error}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to create group', details: error };
  }
}