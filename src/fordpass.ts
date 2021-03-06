import axios from 'axios';
import { AxiosRequestConfig, Method } from 'axios';
import { Logging } from 'homebridge';
import { VehicleInfo, Command } from './models/vehicle';
import { CommandStatus } from './models/command';
import { FordpassConfig } from './models/config';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'fordpass-na/353 CFNetwork/1121.2.2 Darwin/19.3.0',
};

const fordAPIUrl = 'https://usapi.cv.ford.com/';

const handleError = function (name: string, status: number, log: Logging): void {
  log.error(`${name} failed with status: ${status}`);
};

export class Vehicle {
  private config: FordpassConfig;
  private readonly log: Logging;
  private info: VehicleInfo | undefined;
  private lastUpdatedTime: Date;
  name: string;
  vin: string;
  autoRefresh: boolean;
  refreshRate: number;

  constructor(name: string, vin: string, config: FordpassConfig, log: Logging) {
    this.config = config;
    this.log = log;
    this.name = name;
    this.vin = vin;
    this.autoRefresh = config.options?.autoRefresh || false;
    this.refreshRate = config.options?.refreshRate || 180;
    this.lastUpdatedTime = new Date();
  }

  async status(): Promise<VehicleInfo | undefined> {
    // Only update if more than one second has elapsed
    const checkTime = new Date(this.lastUpdatedTime);
    checkTime.setSeconds(checkTime.getSeconds() + 1);
    if (new Date().getTime() < checkTime.getTime()) {
      return this.info;
    }

    const url = fordAPIUrl + `/api/vehicles/v4/${this.vin}/status`;
    const options: AxiosRequestConfig = {
      url: url,
      headers: defaultHeaders,
      params: {
        lrdt: '01-01-1970 00:00:00',
      },
    };

    options.headers['Application-Id'] = '71A3AD0A-CF46-4CCF-B473-FC7FE5BC4592';
    options.headers['auth-token'] = this.config.access_token;
    try {
      const result = await axios(options);
      if (result.status === 200 && result.data.status === 200) {
        this.info = result.data.vehiclestatus as VehicleInfo;
        return this.info;
      } else if (result.data.status === 401) {
        this.log.error(`You do not have authorization to access ${this.name}.`);
      } else {
        handleError('Status', result.data.status, this.log);
      }
    } catch (error) {
      this.log.error(`Status failed with error: ${error.code || error.response.status}`);
    }
  }

  async issueCommand(command: Command): Promise<string> {
    let method: Method = 'GET';
    let endpoint = '';
    switch (command) {
      case Command.START: {
        method = 'PUT';
        endpoint = `api/vehicles/v2/${this.vin}/engine/start`;
        break;
      }
      case Command.STOP: {
        method = 'DELETE';
        endpoint = `api/vehicles/v2/${this.vin}/engine/start`;
        break;
      }
      case Command.LOCK: {
        method = 'PUT';
        endpoint = `api/vehicles/v2/${this.vin}/doors/lock`;
        break;
      }
      case Command.UNLOCK: {
        method = 'DELETE';
        endpoint = `api/vehicles/v2/${this.vin}/doors/lock`;
        break;
      }
      case Command.REFRESH: {
        method = 'PUT';
        endpoint = `api/vehicles/v2/${this.vin}/status`;
        break;
      }
      default: {
        this.log.error('invalid command');
        break;
      }
    }

    if (endpoint) {
      const url = fordAPIUrl + endpoint;
      const options: AxiosRequestConfig = {
        method: method,
        url: url,
        headers: defaultHeaders,
      };

      options.headers['Application-Id'] = '71A3AD0A-CF46-4CCF-B473-FC7FE5BC4592';
      options.headers['auth-token'] = this.config.access_token;
      const result = await axios(options);
      if (result.status !== 200) {
        handleError('IssueCommand', result.status, this.log);
        return '';
      }
      return result.data.commandId;
    }
    return '';
  }

  async commandStatus(command: Command, commandId: string): Promise<CommandStatus | undefined> {
    let endpoint = '';
    if (command === Command.START || command === Command.STOP) {
      endpoint = `api/vehicles/v2/${this.vin}/engine/start/${commandId}`;
    } else if (command === Command.LOCK || command === Command.UNLOCK) {
      endpoint = `api/vehicles/v2/${this.vin}/doors/lock/${commandId}`;
    } else if (command === Command.REFRESH) {
      endpoint = `api/vehicles/v2/${this.vin}/status/${commandId}`;
    } else {
      this.log.error('invalid command');
    }
    const url = fordAPIUrl + endpoint;
    const options: AxiosRequestConfig = {
      baseURL: fordAPIUrl,
      url: url,
      headers: defaultHeaders,
    };

    options.headers['Application-Id'] = '71A3AD0A-CF46-4CCF-B473-FC7FE5BC4592';
    options.headers['auth-token'] = this.config.access_token;
    const result = await axios(options);
    if (result.status === 200) {
      return result.data as CommandStatus;
    } else {
      handleError('CommandStatus', result.status, this.log);
    }
    return;
  }
}
