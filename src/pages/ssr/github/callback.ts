   // src/pages/api/github/callback.ts
   import type { NextApiRequest, NextApiResponse } from 'next';
   import axios from 'axios';

   export default async function handler(req: NextApiRequest, res: NextApiResponse) {
       if (req.method !== 'POST') {
           return res.status(405).json({ error: 'Method Not Allowed' }); // Handle only POST requests
       }

       const { code } = req.body;

       if (!code) {
           return res.status(400).json({ error: 'Code is required' }); // Handle missing code
       }

       try {
           const response = await axios.post('https://github.com/login/oauth/access_token', {
               client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
               client_secret: process.env.NEXT_PUBLIC_GITHUB_CLIENT_SECRET,
               code,
           }, {
               headers: { Accept: 'application/json' }
           });

           res.status(200).json(response.data);
       } catch (error) {
           console.error('Error exchanging code for token:', error);
           res.status(500).json({ error: 'Failed to exchange code for token' });
       }
   }