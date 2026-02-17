export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  roleType: 'conductor' | 'propietario' | 'administrador' | 'otro';
  status: 'online' | 'offline' | 'away';
  avatar?: string;
}
