import Mailosaur from 'mailosaur';

export async function fetchMailosaurMessage(serverId: string, sentTo: string, timeout = 60000) {
  const client = new Mailosaur(process.env.MAILOSAUR_API_KEY);
  return client.messages.get(
    serverId,
    { sentTo },
    {
      timeout,
      receivedAfter: new Date(Date.now() - 10000)
    }
  );
}

export async function fetchMailosaurMessageWithDelay(serverId: string, sentTo: string, timeout = 120000) {
  const client = new Mailosaur(process.env.MAILOSAUR_API_KEY);
  return client.messages.get(
    serverId,
    { sentTo },
    {
      timeout,
      receivedAfter: new Date(Date.now() - 60000)
    }
  );
}
