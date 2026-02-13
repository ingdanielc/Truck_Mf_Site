export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  roleType: 'conductor' | 'propietario' | 'otro';
  status: 'online' | 'offline' | 'away';
  avatar?: string;
}
