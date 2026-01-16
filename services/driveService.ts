import { Project, User } from "../types";

// Note: In a real production app, these would be in environment variables
// Since we are in a WebContainer/Demo environment, we might simulate if keys are missing
// You must set REACT_APP_CLIENT_ID and API_KEY in your env
const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || ''; 
const API_KEY = process.env.API_KEY || '';
// const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]; // Removed to prevent discovery error
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleServices = (): Promise<void> => {
  return new Promise((resolve) => {
    const checkInit = () => {
       if ((window as any).gapi && (window as any).google) {
          (window as any).gapi.load('client', async () => {
             try {
                 // Initialize the client with API key only first
                 await (window as any).gapi.client.init({
                    apiKey: API_KEY,
                 });
                 
                 // Explicitly load the Drive API v3
                 // This method is more robust against "API discovery response missing required fields" errors
                 await (window as any).gapi.client.load('drive', 'v3');
                 
                 gapiInited = true;
             } catch (error) {
                 console.warn("GAPI init failed (likely due to missing keys or network block), falling back to mock mode", error);
             }
             
             try {
                 tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: '', // defined at request time
                 });
                 gisInited = true;
             } catch (error) {
                 console.warn("GIS init failed", error);
             }

             resolve();
          });
       } else {
         setTimeout(checkInit, 100);
       }
    };
    checkInit();
  });
};

export const handleGoogleLogin = (): Promise<User> => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
        // Fallback for demo without keys
        if (!CLIENT_ID) {
            console.warn("No Client ID provided. Simulating login.");
            resolve({
                name: "Demo User",
                email: "demo@neoscriber.app",
                picture: "https://ui-avatars.com/api/?name=Neo+Scriber&background=0D8ABC&color=fff",
                accessToken: "mock_token"
            });
            return;
        }
        reject("Google Services not initialized");
        return;
    }

    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        reject(resp);
        return;
      }
      
      // Fetch user profile
      try {
         const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${resp.access_token}` }
         }).then(r => r.json());
         
         resolve({
            name: userInfo.name,
            email: userInfo.email,
            picture: userInfo.picture,
            accessToken: resp.access_token
         });
      } catch (err) {
         reject(err);
      }
    };

    if ((window as any).gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
      tokenClient.requestAccessToken({prompt: ''});
    }
  });
};

export const saveToDrive = async (project: Project, accessToken: string): Promise<string> => {
    if (!CLIENT_ID) {
        console.log("Simulating Drive Save", project);
        return "mock_drive_id_" + Date.now();
    }

    const fileContent = JSON.stringify(project);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
        name: `${project.name}.neoscriber`,
        mimeType: 'application/json',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form,
    });
    
    const data = await res.json();
    return data.id;
};

export const loadFromDrive = async (fileId: string, accessToken: string): Promise<Project> => {
    if (!CLIENT_ID) throw new Error("Drive not configured");

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
    });
    
    if (!res.ok) throw new Error("Failed to load file");
    return await res.json();
};

export const listDriveProjects = async (accessToken: string): Promise<any[]> => {
    if (!CLIENT_ID) {
        return [
            { id: 'mock_1', name: 'Demo Project 1.neoscriber' },
            { id: 'mock_2', name: 'Interview 2024.neoscriber' }
        ];
    }

    // Query for files with our extension or mimeType
    const q = "name contains '.neoscriber' and trashed = false";
    const res = await (window as any).gapi.client.drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)',
        q: q
    });
    return res.result.files;
};