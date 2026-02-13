import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  roleType: 'conductor' | 'propietario' | 'otro';
  status: 'online' | 'offline' | 'away';
  avatar?: string;
}

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss'],
})
export class SecurityComponent implements OnInit {
  users: User[] = [
    {
      id: 1,
      name: 'Alejandro Ortiz',
      email: 'alejo.ortiz@ct.com',
      role: 'CONDUCTOR',
      roleType: 'conductor',
      status: 'online',
    },
    {
      id: 2,
      name: 'Beatriz Méndez',
      email: 'bmendez.logistica@ct.com',
      role: 'PROPIETARIO',
      roleType: 'propietario',
      status: 'online',
    },
    {
      id: 3,
      name: 'Carlos Jiménez',
      email: 'carlos.j@ct.com',
      role: 'CONDUCTOR',
      roleType: 'conductor',
      status: 'offline',
    },
    {
      id: 4,
      name: 'David Salazar',
      email: 'dsalazar@ct.com',
      role: 'CONDUCTOR',
      roleType: 'conductor',
      status: 'online',
    },
    {
      id: 5,
      name: 'Elena Rojas',
      email: 'e.rojas.transportes@ct.com',
      role: 'PROPIETARIO',
      roleType: 'propietario',
      status: 'online',
    },
    {
      id: 6,
      name: 'Fernando Ruiz',
      email: 'fruiz@ct.com',
      role: 'CONDUCTOR',
      roleType: 'conductor',
      status: 'away',
    },
  ];

  activeFilter: string = 'Todos';
  filters: string[] = ['Todos', 'Conductores', 'Propietarios'];

  constructor() {}

  ngOnInit(): void {}

  setFilter(filter: string): void {
    this.activeFilter = filter;
  }
}
