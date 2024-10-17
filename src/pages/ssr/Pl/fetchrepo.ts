import { useState, useEffect } from 'react';
import { useGlobalState } from "@/hooks";

interface Repo {
  name: string;
  cloneUrl: string;
}

const PROCESS_ID = "yJZ3_Yrc-qYRt1zHmY7YeNvpmQwuqyK3dT0-gxWftew";

export default async function fetchUserRepos(walletAddress: string): Promise<Repo[]> {
  const response = await fetch(`https://cu63.ao-testnet.xyz/dry-run?process-id=${PROCESS_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Id: "1234",
      Target: PROCESS_ID,
      Owner: "1234",
      Anchor: "0",
      Data: "1234",
      Tags: [
        { name: "Action", value: "Get-User-Owned-Contributed-Repos" },
        { name: "User-Address", value: walletAddress },
        { name: "Data-Protocol", value: "ao" },
        { name: "Type", value: "Message" },
        { name: "Variant", value: "ao.TN.1" }
      ]
    })
  });

  if (!response.ok) {
    throw new Error('Failed to fetch repositories');
  }

  const data = await response.json();
  
  // Parse the result from the Data field
  const reposData = JSON.parse(data.Messages[0].Data).result;
  
  // Extract the name and create a custom clone URL for each repository
  const repos: Repo[] = reposData.map((repo: any) => ({
    name: repo.name,
    cloneUrl: `proland://${repo.id} ${repo.name}`
  }));
  
  return repos;
}